import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../../scripts/staging/prepare-exact-sha-release.mjs", import.meta.url), "utf8");
const contract = readFileSync(new URL("../../scripts/staging/billing-v1-pr394-deployment-contract.mjs", import.meta.url), "utf8");

test("PR394 gets a distinct seven-function artifact, not the historic four-function package", () => {
  assert.match(script, /billingFullReleaseId = "billing-pr394-deploy-7befb7f2"/);
  assert.match(script, /if \(release\.releaseId === billingFullReleaseId\)/);
  for (const name of [
    "recordProposalPriorPayment", "recordHistoricalCashDisposition", "issueProposalClientReview",
    "getProposalClientReview", "acceptProposalClientReview", "createProposalCheckout",
    "stripeBillingWebhook",
  ]) {
    assert.ok(script.includes(`"${name}"`), `Missing full Billing export: ${name}`);
    assert.ok(contract.includes(`"${name}"`), `Not in deployment contract: ${name}`);
  }
  assert.match(script, /exact seven-function target order/);
});

test("PR394 package retains webhook signing-secret declaration; only prior Billing packages strip it", () => {
  const oldGate = script.indexOf("if (billingReleaseIds.has(release.releaseId))");
  const fullGate = script.indexOf("if (release.releaseId === billingFullReleaseId)");
  assert.ok(oldGate >= 0 && fullGate > oldGate);
  assert.match(script.slice(oldGate, fullGate), /client\.replace\(webhookDeclaration, ""\)/);
  assert.doesNotMatch(script.slice(fullGate, script.indexOf("if (stagingEntry.includes", fullGate) + 100), /client\.replace\(webhookDeclaration/);
  assert.match(script.slice(fullGate), /stripeClient\.js/);
  assert.match(script.slice(fullGate), /Full Billing staging package is missing the Stripe webhook secret/);
});

test("Existing validation-only Billing release remains undeployable", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../scripts/staging/approved-exact-sha-releases.json", import.meta.url), "utf8"));
  const checkpoint = manifest["billing-pr394-7befb7f2"];
  assert.equal(checkpoint.validationOnly, true);
  assert.deepEqual(checkpoint.functions, []);
  assert.deepEqual(checkpoint.newFunctions, []);
  assert.equal(checkpoint.hosting, false);
});

test("Separate seven-function release manifest stays validation-only until bootstrap approval", () => {
  const releases = JSON.parse(readFileSync(new URL("../../scripts/staging/approved-exact-sha-releases.json", import.meta.url), "utf8"));
  const candidate = releases["billing-pr394-deploy-7befb7f2"];
  assert.ok(candidate);
  assert.equal(candidate.applicationSha, "7befb7f2dba6debb0e32c9336cda99ad897712de");
  assert.equal(candidate.validationOnly, true);
  assert.equal(candidate.projectId, "sandman-combat-staging");
  assert.equal(candidate.functions.length, 7);
  assert.equal(candidate.newFunctions.length, 6);
  assert.equal(candidate.functionRuntime, "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com");
  assert.deepEqual(candidate.functionSecrets, {
    issueProposalClientReview: ["RESEND_API_KEY"],
    createProposalCheckout: ["STRIPE_SECRET_KEY"],
    stripeBillingWebhook: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  });
  assert.deepEqual(candidate.bootstrap.functions, candidate.newFunctions);
  assert.equal(candidate.bootstrap.approvalRequired, true);
  assert.equal(candidate.bootstrap.routineDeployMayCreate, false);
  const workflow = readFileSync(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /if\(r\?\.validationOnly\)/);
  assert.match(workflow, /inputs\.release_id != 'billing-pr394-deploy-7befb7f2'/);
  assert.match(workflow, /billing-pr394-deploy-7befb7f2/);
});

test("Release policy rejects accidentally enabling the full Billing candidate for deployment", async () => {
  const { validateRelease, STAGING_WIF_PROVIDER, TRUSTED_WORKFLOW_REF } = await import("../../scripts/staging/exact-sha-release-policy.mjs");
  const releases = JSON.parse(readFileSync(new URL("../../scripts/staging/approved-exact-sha-releases.json", import.meta.url), "utf8"));
  const release = { releaseId: "billing-pr394-deploy-7befb7f2", ...releases["billing-pr394-deploy-7befb7f2"] };
  const ctx = {
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
  };
  assert.equal(validateRelease(release, ctx), release);
  assert.throws(() => validateRelease({ ...release, validationOnly: false }, ctx), /deployment-disabled/);
  assert.throws(() => validateRelease({ ...release, functions: release.functions.slice(0, -1) }, ctx), /deployment-disabled/);
  assert.throws(() => validateRelease({ ...release, functionSecrets: {} }, ctx), /deployment-disabled/);
});

test("Staging family review artifact rewrites the only production link to staging", () => {
  assert.match(script, /productionReviewHost = "https:\/\/sandmancombat\.com"/);
  assert.match(script, /stagingReviewHost = "https:\/\/sandman-combat-staging\.web\.app"/);
  assert.match(script, /reviewModule\.split\(productionReviewHost\)\.length !== 2/);
  assert.match(script, /reviewModule\.replace\(productionReviewHost, stagingReviewHost\)/);
});

test("Protected workflow recognizes an HTTP webhook instead of requiring callableTrigger", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /process\.argv\[1\]==="stripeBillingWebhook" \? e\.httpsTrigger && !e\.callableTrigger : e\.callableTrigger/);
  assert.match(workflow, /\|stripeBillingWebhook\) ;; \*\) exit 64 ;; esac/);
  assert.match(workflow, /if test "\$\{\{ inputs\.action \}\}" = "deploy"/);
});

test("PR394 diagnosis probes effective function creation without making cloud changes", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/staging-exact-sha-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /Verify PR394 create permission as the actual staging deployer/);
  assert.match(workflow, /inputs\.release_id == 'billing-pr394-deploy-7befb7f2'/);
  const step = workflow.split("Verify PR394 create permission as the actual staging deployer")[1]
    .split("- name: Compare Firebase Admin SDK configuration authorization")[0];
  assert.match(step, /cloudfunctions\.functions\.create/);
  assert.match(step, /testIamPermissions/);
  assert.doesNotMatch(step, /gcloud functions deploy|add-iam-policy-binding|set-iam-policy/);
});
