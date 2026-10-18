import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../../.github/workflows/staging-firebase-auth-diagnostic.yml", import.meta.url), "utf8");

test("Firebase authorization diagnostic is manual, protected, and staging-only", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /test "\$\{REQUESTED_PROJECT\}" = "sandman-combat-staging"/);
  assert.match(workflow, /service_account: sandman-practice-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.doesNotMatch(workflow, /sandmandashboard|firebase-tools|firebase deploy|gcloud functions deploy/);
});

test("diagnostic verifies permissions, identity, scopes, and quota behavior without exposing tokens", () => {
  assert.match(workflow, /firebase\.projects\.get/);
  assert.match(workflow, /serviceusage\.services\.use/);
  assert.match(workflow, /gcloud auth list --filter=status:ACTIVE/);
  assert.match(workflow, /oauth2\.googleapis\.com\/tokeninfo/);
  assert.match(workflow, /quota_project_id/);
  assert.match(workflow, /x-goog-user-project: sandman-combat-staging/);
  assert.match(workflow, /normal_request/);
  assert.match(workflow, /explicit_quota_project_request/);
  assert.doesNotMatch(workflow, /echo .*access_token|console\.log\([^\n]*access_token/);
});

test("diagnostic contains no IAM, deployment, or application mutation commands", () => {
  assert.doesNotMatch(workflow, /add-iam-policy-binding|set-iam-policy|roles\//);
  assert.doesNotMatch(workflow, /\b(PATCH|PUT|DELETE)\b/);
  assert.doesNotMatch(workflow, /actions\/checkout|git (commit|push)|firestore.*(write|delete)/);
});
