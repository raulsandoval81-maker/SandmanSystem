import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  APPROVED_FUNCTIONS,
  STAGING_WIF_PROVIDER,
  TRUSTED_WORKFLOW_REF,
  loadRelease,
  requireRuntimeMigrationApproval,
  validateRelease,
  validateRemotePreflight,
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
const runtimes = Object.fromEntries(APPROVED_FUNCTIONS.map(name => [name, release.currentRuntime]));

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

test("runtime migration requires a release-bound confirmation", () => {
  assert.throws(() => requireRuntimeMigrationApproval(release, runtimes, ""), /separate explicit approval/);
  assert.equal(requireRuntimeMigrationApproval(release, runtimes, `MIGRATE_RUNTIME:${release.releaseId}:${release.projectId}`), true);
  const migrated = Object.fromEntries(APPROVED_FUNCTIONS.map(name => [name, release.functionRuntime]));
  assert.equal(requireRuntimeMigrationApproval(release, migrated, ""), false);
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

test("validation-only workflow cannot dispatch Hosting or Functions deployment", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /- validate\s*\n/);
  assert.doesNotMatch(workflow, /^\s+- deploy\s*$/m);
  const functionsJob = workflow.match(/^  deploy-functions:\n([\s\S]*?)(?=^  deploy-hosting:)/m)?.[1];
  const hostingJob = workflow.match(/^  deploy-hosting:\n([\s\S]*)$/m)?.[1];
  assert.ok(functionsJob, "Functions job definition exists");
  assert.ok(hostingJob, "Hosting job definition exists");
  assert.match(functionsJob, /^    if: \$\{\{ false \}\}/m);
  assert.match(hostingJob, /^    if: \$\{\{ false \}\}/m);
});
