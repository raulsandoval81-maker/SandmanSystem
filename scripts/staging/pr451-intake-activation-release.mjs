import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL("./pr451-intake-activation-release.json", import.meta.url);
export const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
const safeName = /^[A-Za-z][A-Za-z0-9]+$/;

export function runtimeFor(entry) {
  if (entry.runtime === "email") return manifest.emailRuntimeServiceAccount;
  if (entry.kind === "gen1-callable") return manifest.gen1RuntimeServiceAccount;
  return manifest.defaultRuntimeServiceAccount;
}

export function deploymentPlan(entry, sourceRoot) {
  if (!manifest.functions.some(item => item.name === entry.name) || !safeName.test(entry.name)) {
    throw new Error("Function is outside the exact release allowlist.");
  }
  const gen1 = entry.kind === "gen1-callable";
  const args = ["functions", "deploy", entry.name, gen1 ? "--no-gen2" : "--gen2",
    `--project=${manifest.projectId}`, `--region=${manifest.region}`, "--runtime=nodejs22",
    `--entry-point=${entry.name}`, `--source=${path.resolve(sourceRoot)}`,
    gen1 ? `--service-account=${runtimeFor(entry)}` : `--run-service-account=${runtimeFor(entry)}`,
    `--build-service-account=projects/${manifest.projectId}/serviceAccounts/${manifest.buildServiceAccount}`,
    "--memory=256Mi", "--timeout=60s", "--max-instances=20",
    `--update-labels=sandman-release=${manifest.releaseId},sandman-source-sha=${manifest.applicationSha}`,
    "--update-env-vars=SANDMAN_STAGING_ACK=sandman-combat-staging,SANDMAN_STAGING_PROJECT_ID=sandman-combat-staging,SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT=sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com",
  ];
  if (!gen1) args.push("--cpu=1", "--concurrency=80", "--ingress-settings=all");
  const secrets = entry.secrets || [];
  args.push(secrets.length ? `--set-secrets=${secrets.map(key => `${key}=${key}:latest`).join(",")}` : "--clear-secrets");
  if (entry.kind.endsWith("callable")) {
    args.push("--trigger-http");
    if (gen1) args.push("--allow-unauthenticated");
  } else if (entry.kind === "gen2-firestore") {
    args.push(`--trigger-event-filters=type=${entry.eventType}`,
      "--trigger-event-filters=database=(default)", "--trigger-event-filters=namespace=(default)",
      `--trigger-event-filters-path-pattern=document=${entry.document}`,
      `--trigger-location=${manifest.triggerRegion}`);
  } else {
    throw new Error("Unsupported function generation or trigger kind.");
  }
  args.push("--quiet");
  return { executable: "gcloud", args, runtime: runtimeFor(entry) };
}

export function validateManifest() {
  if (manifest.projectId !== "sandman-combat-staging" || manifest.applicationSha.length !== 40 ||
      manifest.deploymentAuthorized !== false || manifest.productionChangesAuthorized !== false ||
      manifest.functions.length !== 16 || manifest.deployBillingFunctions !== false ||
      manifest.deployFirestoreRules !== false || manifest.deployFirestoreIndexes !== false ||
      manifest.deployHosting !== false) throw new Error("Release manifest boundary mismatch.");
  const names = manifest.functions.map(entry => entry.name);
  if (new Set(names).size !== names.length) throw new Error("Duplicate function target.");
  return true;
}

export function isVerifiedNotFound(result) {
  if (result.status === 0 || String(result.stdout || "").trim()) return false;
  const error = String(result.stderr || "");
  return /ResponseError: status=\[404\]/.test(error) &&
    /(NOT_FOUND|does not exist|was not found)/i.test(error);
}

function userEnvironment(environment = {}) {
  return Object.fromEntries(Object.entries(environment)
    .filter(([key]) => key.startsWith("SANDMAN_"))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function secretKeys(value = []) {
  return value.map(item => String(item?.key || "")).filter(Boolean).sort();
}

export function validateExistingFunction(entry, value) {
  const gen1 = entry.kind === "gen1-callable";
  const expectedEnvironment = {
    SANDMAN_STAGING_ACK: manifest.projectId,
    SANDMAN_STAGING_PROJECT_ID: manifest.projectId,
    SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT:
      "sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com",
  };
  const actual = {
    name: value.name,
    state: value.state || value.status,
    generation: gen1 ? "GEN_1" : value.environment,
    runtime: value.buildConfig?.runtime || value.runtime,
    entryPoint: value.buildConfig?.entryPoint || value.entryPoint,
    buildServiceAccount: value.buildConfig?.serviceAccount || value.buildServiceAccount,
    runtimeServiceAccount: value.serviceConfig?.serviceAccountEmail || value.serviceAccountEmail,
    memory: value.serviceConfig?.availableMemory || `${value.availableMemoryMb}Mi`,
    timeout: value.serviceConfig?.timeoutSeconds ?? Number(String(value.timeout || "").replace(/s$/, "")),
    maxInstances: value.serviceConfig?.maxInstanceCount ?? value.maxInstances,
    cpu: gen1 ? null : value.serviceConfig?.availableCpu,
    concurrency: gen1 ? null : value.serviceConfig?.maxInstanceRequestConcurrency,
    ingress: value.serviceConfig?.ingressSettings || value.ingressSettings,
    environmentVariables: userEnvironment(value.serviceConfig?.environmentVariables || value.environmentVariables),
    secrets: secretKeys(value.serviceConfig?.secretEnvironmentVariables || value.secretEnvironmentVariables),
    release: value.labels?.["sandman-release"],
    sourceSha: value.labels?.["sandman-source-sha"],
  };
  const expected = {
    name: `projects/${manifest.projectId}/locations/${manifest.region}/functions/${entry.name}`,
    state: "ACTIVE",
    generation: gen1 ? "GEN_1" : "GEN_2",
    runtime: "nodejs22",
    entryPoint: entry.name,
    buildServiceAccount: `projects/${manifest.projectId}/serviceAccounts/${manifest.buildServiceAccount}`,
    runtimeServiceAccount: runtimeFor(entry),
    memory: "256Mi",
    timeout: 60,
    maxInstances: 20,
    cpu: gen1 ? null : "1",
    concurrency: gen1 ? null : 80,
    ingress: "ALLOW_ALL",
    environmentVariables: expectedEnvironment,
    secrets: [...(entry.secrets || [])].sort(),
    release: manifest.releaseId,
    sourceSha: manifest.applicationSha,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Existing function configuration mismatch: ${entry.name}`);
  }
  if (entry.kind === "gen2-firestore") {
    const filters = Object.fromEntries((value.eventTrigger?.eventFilters || [])
      .map(filter => [filter.attribute, { value: filter.value, operator: filter.operator || null }]));
    if (value.eventTrigger?.eventType !== entry.eventType ||
        value.eventTrigger?.triggerRegion !== manifest.triggerRegion ||
        filters.database?.value !== "(default)" || filters.namespace?.value !== "(default)" ||
        filters.document?.value !== entry.document || filters.document?.operator !== "match-path-pattern") {
      throw new Error(`Existing Firestore trigger configuration mismatch: ${entry.name}`);
    }
  }
  return true;
}

function normalizedBindings(policy = {}) {
  return [...(policy.bindings || [])]
    .map(binding => ({ role: binding.role, members: [...(binding.members || [])].sort(), condition: binding.condition || null }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function invocationState(entry, { runService, functionIam, runIam } = {}) {
  if (!entry.kind.endsWith("callable")) return "not-applicable";
  const functionBindings = normalizedBindings(functionIam);
  if (entry.kind === "gen1-callable") {
    const completed = [{ role: "roles/cloudfunctions.invoker", members: ["allUsers"], condition: null }];
    if (JSON.stringify(functionBindings) === JSON.stringify(completed)) return "complete";
    if (!functionBindings.length) return "needs-configuration";
    throw new Error(`Unexpected Gen 1 invocation IAM: ${entry.name}`);
  }
  const runBindings = normalizedBindings(runIam);
  if (functionBindings.length || runBindings.length) {
    throw new Error(`Unexpected Gen 2 invocation IAM: ${entry.name}`);
  }
  const annotation = runService?.metadata?.annotations?.["run.googleapis.com/invoker-iam-disabled"];
  if (annotation === "true") return "complete";
  if (annotation === undefined) return "needs-configuration";
  throw new Error(`Unexpected Gen 2 invoker annotation: ${entry.name}`);
}

export function invocationPlan(entry) {
  if (entry.kind === "gen1-callable") return {
    executable: "gcloud", args: ["functions", "add-iam-policy-binding", entry.name,
      `--project=${manifest.projectId}`, `--region=${manifest.region}`,
      "--member=allUsers", "--role=roles/cloudfunctions.invoker", "--quiet"],
  };
  if (entry.kind === "gen2-callable") return {
    executable: "gcloud", args: ["run", "services", "update", entry.name.toLowerCase(),
      `--project=${manifest.projectId}`, `--region=${manifest.region}`, "--no-invoker-iam-check", "--quiet"],
  };
  throw new Error("Invocation configuration applies only to callables.");
}

export function executePlan(plan, spawn = spawnSync) {
  const result = spawn(plan.executable, plan.args, { encoding: "utf8", shell: false });
  if (result.status !== 0) {
    const sanitized = String(result.stderr || result.stdout || "Command failed.")
      .replace(/(ya29\.|eyJ)[A-Za-z0-9._~+\/-]+/g, "[REDACTED]");
    throw new Error(`Release command failed: ${sanitized}`);
  }
  return result;
}

function readCloudJson(args, label) {
  const result = spawnSync("gcloud", args, { encoding: "utf8", shell: false });
  if (result.status !== 0 || !String(result.stdout || "").trim()) {
    const sanitized = String(result.stderr || "Cloud configuration lookup failed.")
      .replace(/(ya29\.|eyJ)[A-Za-z0-9._~+\/-]+/g, "[REDACTED]");
    throw new Error(`Unable to verify ${label}: ${sanitized}`);
  }
  return JSON.parse(result.stdout);
}

function readInvocationConfiguration(entry) {
  const functionIam = readCloudJson(["functions", "get-iam-policy", entry.name,
    `--project=${manifest.projectId}`, `--region=${manifest.region}`, "--format=json"],
  `${entry.name} Cloud Functions IAM`);
  if (entry.kind === "gen1-callable") return { functionIam };
  const service = entry.name.toLowerCase();
  return {
    functionIam,
    runService: readCloudJson(["run", "services", "describe", service,
      `--project=${manifest.projectId}`, `--region=${manifest.region}`, "--format=json"],
    `${entry.name} Cloud Run service`),
    runIam: readCloudJson(["run", "services", "get-iam-policy", service,
      `--project=${manifest.projectId}`, `--region=${manifest.region}`, "--format=json"],
    `${entry.name} Cloud Run IAM`),
  };
}

function completeInvocationConfiguration(entry) {
  if (!entry.kind.endsWith("callable")) return;
  const before = invocationState(entry, readInvocationConfiguration(entry));
  if (before === "complete") return;
  executePlan(invocationPlan(entry));
  const after = invocationState(entry, readInvocationConfiguration(entry));
  if (after !== "complete") throw new Error(`Invocation configuration did not complete: ${entry.name}`);
}

async function main() {
  const [command, sourceRoot] = process.argv.slice(2);
  validateManifest();
  if (command === "plan") {
    console.log(JSON.stringify(manifest.functions.map(entry => deploymentPlan(entry, sourceRoot)), null, 2));
    return;
  }
  if (command !== "bootstrap" || process.env.GITHUB_REPOSITORY !== manifest.repository ||
      process.env.GITHUB_REF !== "refs/heads/main" ||
      process.env.SANDMAN_INTAKE_BOOTSTRAP_APPROVAL !== "APPROVE_16_STAGING_INTAKE_ACTIVATION_FUNCTIONS" ||
      process.env.SANDMAN_CONFIRM_PROJECT !== manifest.projectId) {
    throw new Error("Protected exact-SHA staging bootstrap authorization is missing.");
  }
  for (const entry of manifest.functions) {
    const describe = spawnSync("gcloud", ["functions", "describe", entry.name,
      `--region=${manifest.region}`, `--project=${manifest.projectId}`, "--format=json"],
    { encoding: "utf8", shell: false });
    if (describe.status === 0) {
      const existing = JSON.parse(describe.stdout);
      validateExistingFunction(entry, existing);
      completeInvocationConfiguration(entry);
      continue;
    }
    if (!isVerifiedNotFound(describe)) {
      const sanitized = String(describe.stderr || "Cloud function lookup failed.")
        .replace(/(ya29\.|eyJ)[A-Za-z0-9._~+\/-]+/g, "[REDACTED]");
      throw new Error(`Unable to verify whether ${entry.name} is absent: ${sanitized}`);
    }
    const plan = deploymentPlan(entry, sourceRoot);
    executePlan(plan);
    const deployed = readCloudJson(["functions", "describe", entry.name,
      `--region=${manifest.region}`, `--project=${manifest.projectId}`, "--format=json"],
    `${entry.name} deployed function`);
    validateExistingFunction(entry, deployed);
    completeInvocationConfiguration(entry);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
