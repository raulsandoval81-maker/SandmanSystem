import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVED_FUNCTIONS, loadRelease, validateRelease } from "./exact-sha-release-policy.mjs";

export const GCLOUD_DEPLOYER_PERMISSIONS = Object.freeze([
  "cloudfunctions.functions.get",
  "cloudfunctions.functions.getIamPolicy",
  "cloudfunctions.functions.update",
  "cloudfunctions.functions.sourceCodeSet",
  "cloudfunctions.locations.list",
  "cloudfunctions.operations.get",
  "resourcemanager.projects.get",
  "run.services.get",
  "run.services.getIamPolicy",
  "serviceusage.services.use",
]);

export const BUILD_ACCOUNT_PERMISSIONS = Object.freeze([
  "artifactregistry.repositories.downloadArtifacts",
  "artifactregistry.repositories.uploadArtifacts",
  "logging.logEntries.create",
  "storage.objects.get",
  "storage.objects.list",
]);

const BOOTSTRAP_ONLY_PERMISSIONS = Object.freeze([
  "cloudfunctions.functions.create",
  "run.services.get",
  "run.services.update",
]);
const BILLING_RELEASE_IDS = new Set(["billing-pr354-014198ea", "billing-pr376-dff3e6d3"]);

function assertSafeSegment(value, label) {
  if (!/^[A-Za-z0-9_.@-]+$/.test(String(value || ""))) throw new Error(`Unsafe ${label}.`);
}

export function deploymentPlan(release, functionName, sourceRoot, mode = "update", { bootstrapVerified = false } = {}) {
  validateRelease(release, {
    repository: release.repository,
    workflowRef: "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main",
    checkedOutSha: release.applicationSha,
    projectId: "sandman-combat-staging",
    confirmProject: "sandman-combat-staging",
    wifProvider: "projects/991554514268/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-hybrid-staging",
    hostingDeployer: release.hostingDeployer,
    functionDeployer: release.functionDeployer,
    functionRuntime: release.functionRuntime,
    authorizationAvailable: true,
  });
  if (release.functionDeploymentTool !== "gcloud-gen2") throw new Error("Release is not authorized for gcloud Gen 2 deployment.");
  if (!release.functions.includes(functionName) || !APPROVED_FUNCTIONS.includes(functionName)) throw new Error("Function is not in the exact release allowlist.");
  const isNew = (release.newFunctions || []).includes(functionName);
  const bootstrapFunctions = release.bootstrap?.functions || (release.bootstrap?.function ? [release.bootstrap.function] : []);
  if (mode === "update" && isNew && bootstrapVerified !== true) throw new Error("New callable requires the separately approved bootstrap action.");
  if (mode === "bootstrap" && (!isNew || !bootstrapFunctions.includes(functionName))) throw new Error("Bootstrap is limited to an approved new callable.");
  assertSafeSegment(functionName, "function name");
  assertSafeSegment(release.functionRuntime, "runtime identity");
  assertSafeSegment(release.functionBuild, "build identity");
  const expected = release.expectedFunctionConfiguration;
  const env = Object.entries(expected.environmentVariables).map(([key, value]) => `${key}=${value}`).join(",");
  const args = [
    "functions", "deploy", functionName, "--gen2",
    `--project=${release.projectId}`,
    `--region=${expected.region}`,
    `--runtime=${expected.runtime}`,
    `--entry-point=${functionName}`,
    `--source=${path.resolve(sourceRoot)}`,
    `--run-service-account=${release.functionRuntime}`,
    `--build-service-account=projects/${release.projectId}/serviceAccounts/${release.functionBuild}`,
    `--cpu=${expected.availableCpu}`,
    `--memory=${expected.availableMemory}`,
    `--timeout=${expected.timeoutSeconds}s`,
    `--max-instances=${expected.maxInstanceCount}`,
    `--concurrency=${expected.maxInstanceRequestConcurrency}`,
    `--ingress-settings=${String(expected.ingressSettings).replace("ALLOW_", "").toLowerCase()}`,
    `--update-env-vars=${env}`,
    "--trigger-http", "--quiet",
  ];
  if (release.functionSecrets) {
    const secrets = release.functionSecrets[functionName] || [];
    args.push(secrets.length ? `--set-secrets=${secrets.map(key => `${key}=${key}:latest`).join(",")}` : "--clear-secrets");
  }
  return Object.freeze({ executable: "gcloud", args, mode, functionName, projectId: release.projectId });
}

export function permissionPlan(release, mode = "update") {
  if (release.functionDeploymentTool !== "gcloud-gen2") {
    return {
      deployer: [], build: [],
      serviceAccounts: [release.functionRuntime, `${release.projectId}@appspot.gserviceaccount.com`]
        .map(account => ({ account, permissions: ["iam.serviceAccounts.actAs"] })),
    };
  }
  const serviceAccounts = [
    { account: release.functionRuntime, permissions: ["iam.serviceAccounts.actAs"] },
    { account: release.functionBuild, permissions: ["iam.serviceAccounts.actAs"] },
  ];
  const buildPermissions = BILLING_RELEASE_IDS.has(release.releaseId)
    ? BUILD_ACCOUNT_PERMISSIONS.filter(permission => permission !== "storage.objects.list")
    : BUILD_ACCOUNT_PERMISSIONS;
  return {
    deployer: [...new Set([...GCLOUD_DEPLOYER_PERMISSIONS,
      ...(mode === "bootstrap" ? BOOTSTRAP_ONLY_PERMISSIONS : [])])].sort(),
    build: [...buildPermissions].sort(),
    serviceAccounts,
  };
}

export function bootstrapPlan(release, sourceRoot, requestedFunction) {
  const functionName = requestedFunction || release.bootstrap?.function || release.bootstrap?.functions?.[0];
  const deploy = deploymentPlan(release, functionName, sourceRoot, "bootstrap");
  return Object.freeze({
    approvalRequired: true,
    deploy,
    preserveCallableApplicationAuth: true,
    invokerConfiguration: {
      executable: "gcloud",
      args: ["run", "services", "update", functionName.toLowerCase(), `--project=${release.projectId}`,
        `--region=${release.expectedFunctionConfiguration.region}`, "--no-invoker-iam-check", "--quiet"],
    },
  });
}

export function rollbackEvidence(release, descriptions) {
  const functions = release.functions.map(name => {
    const before = descriptions[name];
    if (!before) throw new Error(`Missing pre-deployment evidence for ${name}.`);
    if (before.absent) return { name, priorState: "absent", rollback: "delete-new-function-with-separate-approval" };
    const source = before.buildConfig?.source?.storageSource;
    if (!source?.bucket || !source?.object) throw new Error(`Missing immutable rollback source for ${name}.`);
    if (release.partialBootstrap?.[name]) return {
      name, priorState: "release-created-partial", failedRun: release.partialBootstrap[name].failedRun,
      updateTime: before.updateTime,
      source: { bucket: source.bucket, object: source.object, generation: source.generation || null },
      rollback: "delete-partial-new-function-with-separate-approval",
    };
    return {
      name,
      priorState: "deployed",
      updateTime: before.updateTime,
      source: { bucket: source.bucket, object: source.object, generation: source.generation || null },
      runtime: before.serviceConfig?.serviceAccountEmail,
      build: before.buildConfig?.serviceAccount,
    };
  });
  return { releaseId: release.releaseId, applicationSha: release.applicationSha, projectId: release.projectId, functions };
}

async function main() {
  const [command, releaseId, functionName, sourceRoot] = process.argv.slice(2);
  const release = await loadRelease(releaseId);
  if (command === "plan") {
    console.log(JSON.stringify(deploymentPlan(release, functionName, sourceRoot, "update")));
    return;
  }
  if (command === "bootstrap-plan") {
    console.log(JSON.stringify(bootstrapPlan(release, sourceRoot), null, 2));
    return;
  }
  if (command === "deploy") {
    const isNew = (release.newFunctions || []).includes(functionName);
    const bootstrapVerified = process.env.SANDMAN_BOOTSTRAP_VERIFIED === "true";
    const plan = deploymentPlan(release, functionName, sourceRoot, "update", {
      bootstrapVerified,
    });
    const result = spawnSync(plan.executable, plan.args, { stdio: "inherit", shell: false });
    if (result.status !== 0) process.exit(result.status || 1);
    if (isNew && bootstrapVerified) {
      const invoker = bootstrapPlan(release, sourceRoot, functionName).invokerConfiguration;
      const invokerResult = spawnSync(invoker.executable, invoker.args, { stdio: "inherit", shell: false });
      if (invokerResult.status !== 0) process.exit(invokerResult.status || 1);
    }
    await writeFile("function-deploy-receipt.json", `${JSON.stringify({
      releaseId, applicationSha: release.applicationSha, functionName, completed: true,
    }, null, 2)}\n`);
    return;
  }
  if (command === "rollback-evidence") {
    const descriptions = Object.fromEntries(await Promise.all(release.functions.map(async name => [
      name, JSON.parse(await readFile(`${sourceRoot}/${name}-before.json`, "utf8")),
    ])));
    console.log(JSON.stringify(rollbackEvidence(release, descriptions), null, 2));
    return;
  }
  throw new Error("Usage: gcloud-function-release.mjs <plan|bootstrap-plan|deploy|rollback-evidence> <release-id> [function] [source-root]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
