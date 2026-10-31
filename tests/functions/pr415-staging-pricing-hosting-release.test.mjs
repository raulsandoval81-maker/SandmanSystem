import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadRelease, validateRelease, TRUSTED_WORKFLOW_REF, STAGING_WIF_PROVIDER } from "../../scripts/staging/exact-sha-release-policy.mjs";

const id = "pricing-entry-pr415-a4e01f3";
const files = ["public/management/pricing/index.html", "public/management/pricing/pricing.js"];
const sourceSha = "a4e01f3e952fdda7d940cf08e29e4e95f2cdede4";
const baseline = "7cf092ee7280ac9046676b3f9970d2a98f283b36";

function context(release) {
  return {
    repository: "raulsandoval81-maker/SandmanSystem",
    workflowRef: TRUSTED_WORKFLOW_REF,
    checkedOutSha: sourceSha,
    projectId: "sandman-combat-staging",
    confirmProject: "sandman-combat-staging",
    wifProvider: STAGING_WIF_PROVIDER,
    hostingDeployer: release.hostingDeployer,
    functionDeployer: release.functionDeployer,
    functionRuntime: release.functionRuntime,
    authorizationAvailable: true,
  };
}

test("PR415 uses the protected exact-SHA hosting-only route", async () => {
  const release = await loadRelease(id);
  assert.equal(release.sourcePr, 415);
  assert.equal(release.applicationSha, sourceSha);
  assert.equal(release.requiredAncestorSha, baseline);
  assert.equal(release.hostingBaselineSha, baseline);
  assert.deepEqual(release.allowedChangedFiles, [...files, "tests/functions/management-pricing-enrollment-entry.test.mjs"]);
  assert.deepEqual(release.hostingFiles, files);
  assert.equal(release.projectId, "sandman-combat-staging");
  assert.equal(release.hostingSite, "sandman-combat-staging");
  assert.equal(release.hosting, true);
  assert.deepEqual(release.functions, []);
  assert.deepEqual(release.newFunctions, []);
  assert.equal(release.recovery.captureHostingReleaseBeforeDeploy, true);
  assert.equal(release.recovery.functionsUnchanged, true);
  assert.equal(validateRelease(release, context(release)), release);
});

test("PR415 release stays fail-closed on identity, scope and unreviewed files", async () => {
  const release = await loadRelease(id);
  assert.throws(() => validateRelease(release, { ...context(release), workflowRef: "raulsandoval81-maker/SandmanSystem/.github/workflows/sync-staging-hosting.yml@refs/heads/main" }), /trusted main/);
  assert.throws(() => validateRelease(release, { ...context(release), projectId: "sandmandashboard" }), /staging Firebase/);
  assert.throws(() => validateRelease(release, { ...context(release), checkedOutSha: baseline }), /approved SHA/);
  assert.throws(() => validateRelease({ ...release, hostingFiles: [...files, "public/connect/proposals/index.html"] }, context(release)), /outside the reviewed application diff/);
  assert.throws(() => validateRelease({ ...release, functions: ["stripeBillingWebhook"] }, context(release)), /Unexpected function target/);
});

test("trusted workflow offers PR415 and stages only reviewed Hosting source", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("- " + id));
  assert.ok(workflow.includes('if test "${RELEASE_ID}" = "' + id + '"; then'));
  assert.ok(workflow.includes("node --test application-source/tests/functions/management-pricing-enrollment-entry.test.mjs"));
  assert.ok(workflow.includes("node --test trusted-tooling/tests/functions/pr415-staging-pricing-hosting-release.test.mjs"));
  assert.ok(workflow.includes("--only hosting --non-interactive"));
  assert.ok(workflow.includes("environment: staging"));
});
