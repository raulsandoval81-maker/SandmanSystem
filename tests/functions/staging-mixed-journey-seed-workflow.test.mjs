import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../../.github/workflows/seed-mixed-journey-staging-roster.yml", import.meta.url), "utf8");

test("mixed-journey seed workflow is manual, protected, and staging-only", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /confirm_project:/);
  assert.match(workflow, /confirm_seed:/);
  assert.match(workflow, /test "\$\{CONFIRM_PROJECT\}" = "sandman-combat-staging"/);
  assert.match(workflow, /test "\$\{SANDMAN_STAGING_PROJECT_ID\}" != "sandmandashboard"/);
  assert.match(workflow, /test "\$\{GITHUB_REF\}" = "refs\/heads\/main"/);
  assert.doesNotMatch(workflow, /firebase(?:-tools)?[^\n]*(?:deploy|use)/i);
});

test("workflow reuses approved WIF identity and boundary validator without credentials", () => {
  assert.match(workflow, /permissions:\s*\n\s*contents: read\s*\n\s*id-token: write/);
  assert.match(workflow, /google-github-actions\/auth@v3/);
  assert.match(workflow, /providers\/sandman-github-actions/);
  assert.match(workflow, /service_account: sandman-staging-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(workflow, /node scripts\/staging\/verify-staging-boundary\.mjs/);
  assert.match(workflow, /sandman-wrestling-runtime@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.doesNotMatch(workflow, /private_key|service-account-key|credentials_json/);
});

test("tests and read-only access checks run before the single seed execution", () => {
  const tests = workflow.indexOf("Run focused seed and staging-boundary tests");
  const boundary = workflow.indexOf("Verify federated identity and read-only Firestore access");
  const seed = workflow.indexOf("Execute existing additive synthetic roster seed once");
  assert.ok(tests >= 0 && boundary > tests && seed > boundary);
  assert.equal((workflow.match(/node functions\/scripts\/seed-mixed-journey-class-staging\.mjs/g) || []).length, 1);
  assert.match(workflow, /gcloud auth application-default print-access-token >\/dev\/null/);
  assert.match(workflow, /gcloud firestore databases describe/);
  assert.match(workflow, /SANDMAN_STAGING_SEED_AUDIT_ID/);
});

test("workflow pins approved seed ancestry and focused verification", () => {
  assert.match(workflow, /git merge-base --is-ancestor 1538b5904830d43a2fbe669490a6290e7e626b98 HEAD/);
  assert.match(workflow, /staging-mixed-journey-roster\.test\.mjs/);
  assert.match(workflow, /wrestling-staging-isolation\.test\.mjs/);
  assert.match(workflow, /staging-mixed-journey-seed-workflow\.test\.mjs/);
  assert.match(workflow, /24 synthetic athletes \(15 R2C \/ 9 P2L\)/);
});
