import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  APPROVED_FUNCTIONS,
  STAGING_WIF_PROVIDER,
  TRUSTED_WORKFLOW_REF,
  functionConfiguration,
  loadRelease,
  validateRelease,
  validateFunctionConfiguration,
  validateRemotePreflight,
  verifyPreservedDeployment,
} from "../../scripts/staging/exact-sha-release-policy.mjs";

const release = await loadRelease("hybrid-pr99-5ed90c5c");
const context = (overrides = {}) => ({
  repository: release.repository,
  workflowRef: TRUSTED_WORKFLOW_REF,
  checkedOutSha: release.applicationSha,
  projectId: release.projectId,
  confirmProject: release.projectId,
  wifProvider: STAGING_WIF_PROVIDER,
  hostingDeployer: release.hostingDeployer,
  functionDeployer: release.functionDeployer,
  functionRuntime: release.functionRuntime,
  authorizationAvailable: true,
  ...overrides,
});
const marker = { projectId: release.projectId, environment: "staging", syntheticDataOnly: true };
const runtimes = Object.fromEntries(APPROVED_FUNCTIONS.map(name => [name, release.functionRuntime]));
const description = name => ({
  name: `projects/sandman-combat-staging/locations/us-central1/functions/${name}`,
  environment: "GEN_2",
  buildConfig: { runtime: "nodejs22", entryPoint: name },
  serviceConfig: {
    serviceAccountEmail: release.functionRuntime,
    availableCpu: "1", availableMemory: "256Mi", timeoutSeconds: 60,
    maxInstanceCount: 20, maxInstanceRequestConcurrency: 80, ingressSettings: "ALLOW_ALL",
    environmentVariables: {
      FIREBASE_CONFIG: "reserved",
      ...release.expectedFunctionConfiguration.environmentVariables,
    },
  },
});

test("approved application source is a full immutable SHA", () => {
  assert.equal(validateRelease(release, context()).applicationSha, "5ed90c5c8eb609e86319a5b5b188642764157dd8");
});

test("invalid and unapproved source revisions are rejected", async () => {
  assert.throws(() => validateRelease(release, context({ checkedOutSha: "a".repeat(40) })), /approved SHA/);
  await assert.rejects(loadRelease("unreviewed-release"), /not approved/);
});

test("production project is rejected", () => {
  assert.throws(() => validateRelease(release, context({ projectId: "sandmandashboard" })), /staging Firebase project/);
});

test("wrong WIF provider and deployer identities are rejected", () => {
  assert.throws(() => validateRelease(release, context({ wifProvider: "projects/1/other" })), /WIF provider/);
  assert.throws(() => validateRelease(release, context({ hostingDeployer: "personal@example.com" })), /Hosting deployer/);
  assert.throws(() => validateRelease(release, context({ functionDeployer: "personal@example.com" })), /function deployer/);
});

test("unexpected function target is rejected", () => {
  assert.throws(() => validateRelease({ ...release, functions: [...release.functions, "openPracticeSession"] }, context()), /Unexpected function/);
});

test("missing or incorrect synthetic marker is rejected", () => {
  assert.throws(() => validateRemotePreflight(release, { runtimeByFunction: runtimes }), /marker/);
  assert.throws(() => validateRemotePreflight(release, { marker: { ...marker, syntheticDataOnly: false }, runtimeByFunction: runtimes }), /marker/);
});

test("unverified and unauthorized runtime identities are rejected", () => {
  assert.throws(() => validateRemotePreflight(release, { marker, runtimeByFunction: {} }), /unverified/);
  assert.throws(() => validateRemotePreflight(release, { marker, runtimeByFunction: { ...runtimes, closePracticeSession: "other@example.com" } }), /unauthorized/);
});

test("unavailable protected authorization is rejected", () => {
  assert.throws(() => validateRelease(release, context({ authorizationAvailable: false })), /authorization is unavailable/);
});

test("existing callable runtime settings are exact and runtime migration is rejected", () => {
  for (const name of APPROVED_FUNCTIONS) {
    assert.equal(validateFunctionConfiguration(release, name, description(name)).entryPoint, name);
    const changed = structuredClone(description(name));
    changed.serviceConfig.serviceAccountEmail = "sandman-practice-runtime@sandman-combat-staging.iam.gserviceaccount.com";
    assert.throws(() => validateFunctionConfiguration(release, name, changed), /configuration mismatch/);
  }
  assert.equal(functionConfiguration(description(APPROVED_FUNCTIONS[0])).region, "us-central1");
});

test("workflow keeps trusted tooling separate from application source and exact targets", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /path: trusted-tooling/);
  assert.match(workflow, /path: application-source/);
  assert.match(workflow, /ref: \$\{\{ steps\.release\.outputs\.application_sha \}\}/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /--only hosting/);
  assert.match(workflow, /savePracticeSessionMemory/);
  assert.match(workflow, /closePracticeSession/);
  assert.doesNotMatch(workflow, /firestore:rules|storage:rules|--only functions(?!:)/);
});

test("workflow separates validation from protected explicit deployment", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /- validate\s*\n/);
  assert.match(workflow, /^\s+- deploy\s*$/m);
  const functionsJob = workflow.match(/^  deploy-functions:\n([\s\S]*?)(?=^  deploy-hosting:)/m)?.[1];
  const hostingJob = workflow.match(/^  deploy-hosting:\n([\s\S]*)$/m)?.[1];
  assert.ok(functionsJob, "Functions job definition exists");
  assert.ok(hostingJob, "Hosting job definition exists");
  assert.match(functionsJob, /^    if: \$\{\{ inputs\.action == 'deploy' \}\}/m);
  assert.match(hostingJob, /^    if: \$\{\{ inputs\.action == 'deploy' \}\}/m);
  assert.match(workflow, /environment: staging/);
});

test("Functions job preserves external configuration and targets one named callable", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  const fnJob = workflow.match(/^  deploy-functions:\n([\s\S]*?)(?=^  deploy-hosting:)/m)?.[1];
  assert.ok(fnJob);
  assert.match(fnJob, /firebase-tools@15\.11\.0 deploy/);
  assert.match(fnJob, /functions:default:\$\{\{ matrix\.function_name \}\}/);
  assert.doesNotMatch(fnJob, /gcloud functions deploy|--trigger-http|--run-service-account/);
  const build = await readFile(new URL("../../scripts/staging/prepare-exact-sha-release.mjs", import.meta.url), "utf8");
  assert.match(build, /firebase\.functions\.json/);
  assert.match(build, /preserveExternalChanges: true/);
  assert.match(workflow, /callableTrigger/);
  assert.match(workflow, /get-iam-policy/);
  assert.doesNotMatch(workflow, /gcloud functions deploy|--trigger-http|--run-service-account/);
});

test("post-deployment comparison rejects callable configuration or IAM drift", () => {
  const name = APPROVED_FUNCTIONS[0];
  const before = description(name);
  const policy = { bindings: [{ role: "roles/run.invoker", members: ["allUsers"] }] };
  assert.equal(verifyPreservedDeployment(release, name, before, structuredClone(before), policy, structuredClone(policy), policy, structuredClone(policy)), true);
  const changed = structuredClone(before);
  changed.serviceConfig.timeoutSeconds = 61;
  assert.throws(() => verifyPreservedDeployment(release, name, before, changed, policy, policy, policy, policy), /configuration mismatch|configuration changed/);
  assert.throws(() => verifyPreservedDeployment(release, name, before, before, policy, {}, policy, policy), /Functions IAM changed/);
});
