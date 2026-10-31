// One-time PR394 staging bootstrap. Invoked only from the separately protected workflow.
// Existing Billing functions, IAM grants, Hosting and production are never mutated.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadRelease, validateFunctionConfiguration, verifyInvokerPolicy } from "./exact-sha-release-policy.mjs";
import { bootstrapPlan } from "./gcloud-function-release.mjs";

export const RELEASE_ID = "billing-pr394-deploy-7befb7f2";
export const APPLICATION_SHA = "7befb7f2dba6debb0e32c9336cda99ad897712de";
export const PROJECT_ID = "sandman-combat-staging";
export const NEW_FUNCTIONS = Object.freeze([
  "recordHistoricalCashDisposition",
  "issueProposalClientReview",
  "getProposalClientReview",
  "acceptProposalClientReview",
  "createProposalCheckout",
  "stripeBillingWebhook",
]);

export function assertBootstrapBoundary(release, env, command) {
  if (!["plan", "execute"].includes(command)) throw Error("Only plan or execute is supported");
  if (release.releaseId !== RELEASE_ID ||
      release.applicationSha !== APPLICATION_SHA ||
      release.projectId !== PROJECT_ID ||
      release.validationOnly !== true ||
      release.bootstrap?.approvalRequired !== true ||
      release.bootstrap?.routineDeployMayCreate !== false ||
      JSON.stringify(release.newFunctions) !== JSON.stringify(NEW_FUNCTIONS) ||
      release.functionRuntime !== "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com" ||
      release.functionBuild !== "sandman-practice-build@sandman-combat-staging.iam.gserviceaccount.com") {
    throw Error("Immutable PR394 bootstrap boundary mismatch");
  }
  if (command === "execute") {
    const expected = {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "raulsandoval81-maker/SandmanSystem",
      GITHUB_REF: "refs/heads/main",
      GITHUB_WORKFLOW_REF: "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main",
      SANDMAN_BOOTSTRAP_PROJECT: PROJECT_ID,
      SANDMAN_BOOTSTRAP_RELEASE: RELEASE_ID,
      SANDMAN_BOOTSTRAP_AUTHORIZATION: "APPROVE_SIX_NEW_STAGING_FUNCTIONS",
      SANDMAN_PUBLIC_HTTP_INVOCATION_APPROVED: "APPROVE_PUBLIC_HTTP_INVOCATION_WITH_APPLICATION_AUTH",
      SANDMAN_STRIPE_TEST_MODE_ATTESTED: "STRIPE_TEST_KEY_VERIFIED",
      SANDMAN_STRIPE_WEBHOOK_SECRET_ATTESTED: "STAGING_WEBHOOK_SECRET_MATCH_VERIFIED",
    };
    for (const [key, value] of Object.entries(expected)) {
      if (env[key] !== value) throw Error("Missing protected bootstrap boundary: " + key);
    }
  }
  return true;
}

function gcloud(args, { tolerateMissing = false } = {}) {
  const result = spawnSync("gcloud", args, { encoding: "utf8", shell: false, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (tolerateMissing && /NOT_FOUND|not found|does not exist/i.test(result.stderr || "")) return null;
    throw Error("gcloud command failed (" + result.status + "): " + args.slice(0, 4).join(" ") +
      "\n" + (result.stderr || "").slice(0, 1000));
  }
  return result.stdout;
}

function inspectFunction(name) {
  const stdout = gcloud(["functions", "describe", name, "--gen2", "--project=" + PROJECT_ID,
    "--region=us-central1", "--format=json"], { tolerateMissing: true });
  return stdout === null ? null : JSON.parse(stdout);
}

function inspectRun(name) {
  return JSON.parse(gcloud(["run", "services", "describe", name.toLowerCase(), "--project=" + PROJECT_ID,
    "--region=us-central1", "--format=json"]));
}

function inspectIam(kind, name) {
  const args = kind === "functions"
    ? ["functions", "get-iam-policy", name, "--gen2", "--project=" + PROJECT_ID, "--region=us-central1", "--format=json"]
    : ["run", "services", "get-iam-policy", name.toLowerCase(), "--project=" + PROJECT_ID, "--region=us-central1", "--format=json"];
  return JSON.parse(gcloud(args));
}

export function describeBootstrapPlan(release, sourceRoot) {
  return NEW_FUNCTIONS.map(name => {
    const plan = bootstrapPlan(release, sourceRoot, name);
    return { functionName: name, project: PROJECT_ID, runtime: release.functionRuntime,
      secrets: release.functionSecrets?.[name] || [], publicInvocationConfigurationRequiresReview: true,
      deploymentTool: plan.deploy.executable, argumentNames: plan.deploy.args
        .filter(x => x.startsWith("--")).map(x => x.split("=")[0]) };
  });
}

async function main() {
  const [command, sourceRoot] = process.argv.slice(2);
  const release = await loadRelease(RELEASE_ID);
  assertBootstrapBoundary(release, process.env, command);
  if (!sourceRoot || path.resolve(sourceRoot) === path.resolve(".")) throw Error("Explicit isolated artifact path required");
  const pkg = JSON.parse(readFileSync(path.join(sourceRoot, "package.json"), "utf8"));
  if (pkg.main !== "staging-release-entry.cjs" || pkg.scripts?.["gcp-build"] !== "") {
    throw Error("Unexpected artifact entry point or Cloud Build script");
  }
  if (command === "plan") {
    console.log(JSON.stringify(describeBootstrapPlan(release, sourceRoot), null, 2));
    return;
  }
  // Verify the existing seventh function is present but never update it here.
  if (!inspectFunction("recordProposalPriorPayment")) throw Error("Existing Billing prior-payment function is missing");
  for (const name of NEW_FUNCTIONS) {
    if (inspectFunction(name)) throw Error("Bootstrap stopped: " + name + " already exists");
  }
  for (const name of NEW_FUNCTIONS) {
    const plan = bootstrapPlan(release, sourceRoot, name);
    const result = spawnSync(plan.deploy.executable, plan.deploy.args, { stdio: "inherit", shell: false });
    if (result.status !== 0) throw Error("Bootstrap failed at " + name + "; no automatic rollback");
    const invoker = spawnSync(plan.invokerConfiguration.executable, plan.invokerConfiguration.args,
      { stdio: "inherit", shell: false });
    if (invoker.status !== 0) throw Error("Invoker setup failed at " + name + "; review partial bootstrap");
    const deployed = inspectFunction(name);
    if (!deployed) throw Error("Function was not created: " + name);
    validateFunctionConfiguration(release, name, deployed);
    verifyInvokerPolicy(release, name, inspectRun(name), inspectIam("functions", name), inspectIam("run", name));
    console.log("Verified staging bootstrap: " + name);
  }
  console.log("Six PR394 functions created and verified in staging; old function and Hosting untouched.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
