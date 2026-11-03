import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyInvocation } from "../helpers/verify-pr451-staging-invocation.mjs";

const manifest = JSON.parse(await readFile("scripts/staging/pr451-paid-in-full-release.json", "utf8"));
const workflow = await readFile(".github/workflows/release-pr451-paid-in-full-staging.yml", "utf8");
const overlay = await readFile("scripts/staging/pr451-hosting-overlay.py", "utf8");

test("PR451 staging release pins exact source and smallest application scope", () => {
  assert.equal(manifest.applicationSha, "88c80ff1ceebbcf281e209559c2c2a2a84ffa7db");
  assert.equal(manifest.requiredAncestorSha, "bbea0bb1e28044e7d95c2ecb695bb032e0265eb0");
  assert.equal(manifest.projectId, "sandman-combat-staging");
  assert.deepEqual(manifest.existingFunctions, ["recordProposalPrepaidCash", "createProposalCheckout"]);
  assert.deepEqual(manifest.newFunctions, ["getProposalEnrollment", "saveProposalEnrollmentAgreement"]);
  assert.deepEqual(manifest.hostingFiles, [
    "public/connect/enrollment/enrollment.js", "public/management/billing/billing.js",
  ]);
  assert.equal(manifest.deploymentAuthorized, false);
  assert.equal(manifest.bootstrapRequiresSeparateApproval, true);
  assert.equal(manifest.productionChanges, false);
});

test("workflow is protected, fail-closed, and separates creation from update", () => {
  assert.match(workflow, /environment: staging/g);
  assert.match(workflow, /ref: 88c80ff1ceebbcf281e209559c2c2a2a84ffa7db/);
  assert.match(workflow, /APPROVE_TWO_NEW_PR451_STAGING_CALLABLES/);
  assert.match(workflow, /APPROVE_PR451_STAGING_RELEASE/);
  assert.match(workflow, /STRIPE_TEST_KEY_VERIFIED/);
  assert.match(workflow, /! gcloud functions describe/);
  assert.match(workflow, /gcloud functions describe "\$\{fn\}"[^\n]+>\/dev\/null/);
  assert.match(workflow, /rsync -a --exclude=\.env/);
  assert.match(workflow, /test ! -e release-functions\/\.env/);
  assert.doesNotMatch(workflow, /sandmandashboard/);
  assert.doesNotMatch(workflow, /allow-unauthenticated/);
});

test("runtime and secret boundaries preserve deployed behavior", () => {
  assert.equal(manifest.functionRuntimeByName.recordProposalPrepaidCash,
    "991554514268-compute@developer.gserviceaccount.com");
  assert.equal(manifest.functionRuntimeByName.createProposalCheckout,
    "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com");
  assert.deepEqual(manifest.functionSecrets.createProposalCheckout, ["STRIPE_SECRET_KEY"]);
  for (const name of ["recordProposalPrepaidCash", "getProposalEnrollment", "saveProposalEnrollmentAgreement"]) {
    assert.deepEqual(manifest.functionSecrets[name], []);
  }
});

test("Hosting overlay preserves the live site and can change only two files", () => {
  assert.match(overlay, /SOURCE_SHA = "88c80ff1ceebbcf281e209559c2c2a2a84ffa7db"/);
  for (const file of manifest.hostingFiles) assert.ok(overlay.includes(`"${file}"`));
  assert.match(overlay, /set\(changed\)\.issubset\(allowed\)/);
  assert.match(overlay, /Hosting baseline changed after approval/);
  assert.match(overlay, /rollbackVersion/);
});

test("invocation preflight fails closed until cloud-admin completes approved access", () => {
  const name = "getProposalEnrollment";
  const service = {
    metadata: { name: "getproposalenrollment", annotations: {
      "run.googleapis.com/invoker-iam-disabled": "true",
      "run.googleapis.com/ingress": "all",
    }},
  };
  assert.doesNotThrow(() => verifyInvocation(name, service, { etag: "abc" }));
  assert.throws(() => verifyInvocation(name, {
    ...service, metadata: { ...service.metadata, annotations: {
      ...service.metadata.annotations,
      "run.googleapis.com/invoker-iam-disabled": "false",
    }},
  }, { etag: "abc" }), /invoker IAM check/);
  assert.throws(() => verifyInvocation(name, service, {
    etag: "abc",
    bindings: [{ role: "roles/run.invoker", members: ["allUsers"] }],
  }), /public IAM principal/);
  assert.throws(() => verifyInvocation(name, service, {}), /IAM policy unreadable/);
  assert.match(workflow, /gcloud run services describe/);
  assert.match(workflow, /gcloud run services get-iam-policy/);
  assert.match(workflow, /verify-pr451-staging-invocation\.mjs/);
  assert.doesNotMatch(workflow, /functions get-iam-policy[^\n]*--v2/);
  assert.doesNotMatch(workflow, /gcloud run services update[^\n]*--no-invoker-iam-check/);
});
