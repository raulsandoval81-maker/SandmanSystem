import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL("./proposal-correction-release.json", import.meta.url);
export const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
export const deployer =
  "serviceAccount:sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com";
export const invocationRole =
  "projects/sandman-combat-staging/roles/sandmanBillingInvokerIamRelease";
export const targetService =
  "projects/sandman-combat-staging/locations/us-central1/services/returnproposaltodraft";

export function invocationCondition(expiration) {
  return `resource.type == "run.googleapis.com/Service" && resource.name in [` +
    `"${targetService}"] && request.time < timestamp("${expiration}")`;
}

export function isVerifiedNotFound(result) {
  if (result.status === 0 || String(result.stdout || "").trim()) return false;
  const error = String(result.stderr || "");
  return /ResponseError: status=\[404\]/.test(error) &&
    /(NOT_FOUND|does not exist|was not found)/i.test(error);
}

function hasMember(policy, role, member) {
  return (policy.bindings || []).some(binding =>
    binding.role === role && (binding.members || []).includes(member));
}

export function verifyPrerequisites(evidence, { now = Date.now() } = {}) {
  if (manifest.projectId !== "sandman-combat-staging" ||
      manifest.applicationSha !== "786dba9824663feea4aa092a1bbe54b151c8233a" ||
      manifest.functionName !== "returnProposalToDraft" ||
      JSON.stringify(manifest.hostingAssets) !==
        JSON.stringify(["/connect/proposals/proposal-safeguards.js"]) ||
      manifest.deploymentAuthorized !== false || manifest.productionAuthorized !== false) {
    throw new Error("Proposal correction release boundary mismatch.");
  }
  if (!isVerifiedNotFound(evidence.functionLookup)) {
    throw new Error("Target Function is not a verified NOT_FOUND resource.");
  }
  const requiredCreatePermissions = [
    "cloudfunctions.functions.create", "cloudfunctions.functions.get",
    "cloudfunctions.functions.sourceCodeSet", "cloudfunctions.functions.update",
    "cloudfunctions.locations.list", "cloudfunctions.operations.get",
    "datastore.databases.getMetadata", "firebase.projects.get", "resourcemanager.projects.get",
  ].sort();
  const actualCreatePermissions = [...(evidence.practiceRole.includedPermissions || [])].sort();
  if (JSON.stringify(actualCreatePermissions) !== JSON.stringify(requiredCreatePermissions)) {
    const missing = requiredCreatePermissions.find(permission => !actualCreatePermissions.includes(permission));
    throw new Error(missing ? `Functions deployer is missing ${missing}.` :
      "Functions deployer role is broader than the approved release boundary.");
  }
  if (JSON.stringify(evidence.invocationRole.includedPermissions || []) !==
      JSON.stringify(["run.services.setIamPolicy"])) {
    throw new Error("Invocation role is broader than run.services.setIamPolicy.");
  }
  const grants = (evidence.projectIam.bindings || []).filter(binding =>
    binding.role === invocationRole && (binding.members || []).includes(deployer));
  if (grants.length !== 1 || grants[0].members?.length !== 1 || grants[0].members[0] !== deployer) {
    throw new Error("Invocation IAM must contain exactly one deployer-only grant.");
  }
  const expression = grants[0].condition?.expression;
  const marker = 'request.time < timestamp("';
  const markerIndex = String(expression || "").indexOf(marker);
  const expiration = markerIndex < 0 ? "" : expression.slice(markerIndex + marker.length, -2);
  const expirationTime = Date.parse(expiration);
  if (!Number.isFinite(expirationTime) || new Date(expirationTime).toISOString() !== expiration ||
      expression !== invocationCondition(expiration) || expirationTime <= now ||
      expirationTime > now + 6 * 60 * 60 * 1000) {
    throw new Error("Invocation IAM condition is not the exact near-term one-service boundary.");
  }
  for (const [label, policy] of [["runtime", evidence.runtimeIam], ["build", evidence.buildIam]]) {
    if (!hasMember(policy, "roles/iam.serviceAccountUser", deployer)) {
      throw new Error(`Functions deployer cannot act as the ${label} identity.`);
    }
  }
  const runtime = `serviceAccount:${manifest.runtimeServiceAccount}`;
  if (!hasMember(evidence.secretIam, "roles/secretmanager.secretAccessor", runtime)) {
    throw new Error("Runtime identity cannot access the staging Stripe secret.");
  }
  const sibling = evidence.siblingFunction;
  if (sibling.state !== "ACTIVE" || sibling.environment !== "GEN_2" ||
      sibling.buildConfig?.runtime !== "nodejs22" ||
      sibling.buildConfig?.serviceAccount !==
        `projects/${manifest.projectId}/serviceAccounts/${manifest.buildServiceAccount}` ||
      sibling.serviceConfig?.serviceAccountEmail !== manifest.runtimeServiceAccount ||
      sibling.serviceConfig?.ingressSettings !== "ALLOW_ALL" ||
      evidence.siblingRun?.metadata?.annotations?.["run.googleapis.com/invoker-iam-disabled"] !== "true") {
    throw new Error("Sibling callable does not match the intended staging configuration.");
  }
  return { expiration, targetService };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) throw new Error("Usage: proposal-correction-release.mjs <evidence-directory>");
  const json = async name => JSON.parse(await readFile(path.join(root, name), "utf8"));
  const text = name => readFile(path.join(root, name), "utf8");
  const result = verifyPrerequisites({
    functionLookup: {
      status: Number((await text("function-status.txt")).trim()),
      stdout: await text("function-stdout.txt"),
      stderr: await text("function-stderr.txt"),
    },
    practiceRole: await json("practice-role.json"),
    invocationRole: await json("invocation-role.json"),
    projectIam: await json("project-iam.json"),
    runtimeIam: await json("runtime-iam.json"),
    buildIam: await json("build-iam.json"),
    secretIam: await json("secret-iam.json"),
    siblingFunction: await json("sibling-function.json"),
    siblingRun: await json("sibling-run.json"),
  });
  console.log(JSON.stringify({ ok: true, ...result }));
}
