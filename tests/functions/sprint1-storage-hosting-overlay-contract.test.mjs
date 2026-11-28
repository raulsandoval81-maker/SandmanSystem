import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlay = readFileSync("scripts/staging/pr834-hosting-overlay.mjs", "utf8");
const workflow = readFileSync(".github/workflows/staging-exact-sha-release.yml", "utf8");
const action = "athlete-sprint1-storage";
const candidate = "25fdba71505416c68f8c6d235f6e7389c3b92e91";
const blob = "d7cb773025a6b0218be6a6f83046c14a2ee4fcff";

test("single approved Sprint 1 asset is pinned by commit and Git blob", () => {
  const start = overlay.indexOf("  sprint1storage: {");
  assert.ok(start > 0);
  const end = overlay.indexOf("\n  },", start);
  const profile = overlay.slice(start, end);
  assert.match(profile, new RegExp(candidate));
  assert.match(profile, new RegExp(blob));
  assert.match(profile, /\/assets\/js\/athlete-journey-routes\.js/);
  assert.equal((profile.match(/\['\//g) || []).length, 1);
  assert.match(profile, /APPROVE_SPRINT1_STORAGE_ONE_FILE_STAGING_ONLY/);
});

test("overlay preserves live Hosting manifest and fails if baseline changes", () => {
  for (const guard of [
    "assert.deepEqual(await activeRelease(), baseline",
    "assert.deepEqual(await manifest(created.name), proposed)",
    "assert.deepEqual(await manifest(after.version), proposed)",
    "assert.deepEqual(changedPaths, [...targets.keys()].sort())",
    "const proposed = new Map(live)",
    "assert.deepEqual(baseline, {",
  ]) assert.ok(overlay.includes(guard), guard);
  assert.match(overlay, /git', \['-C', 'candidate', 'hash-object'/);
});

test("protected workflow authorizes separate preflight and deploy actions", () => {
  assert.match(workflow, /- athlete-sprint1-storage-preflight/);
  assert.match(workflow, /- athlete-sprint1-storage-deploy/);
  const start = workflow.indexOf("  athlete-sprint1-storage-overlay:");
  const end = workflow.indexOf("\n  pr837-hosting-overlay:", start);
  assert.ok(start > 0 && end > start);
  const job = workflow.slice(start, end);
  assert.match(job, /environment: staging/);
  assert.match(job, /concurrency: sandman-staging-hosting/);
  assert.match(job, /GITHUB_RUN_ATTEMPT/);
  assert.match(job, /GITHUB_WORKFLOW_REF/);
  assert.match(job, /APPROVE_SPRINT1_STORAGE_ONE_FILE_STAGING_ONLY/);
  assert.match(job, /protected_2c_expected_hosting_release/);
  assert.match(job, /protected_2c_expected_hosting_version/);
  assert.match(job, new RegExp(candidate));
  assert.doesNotMatch(job, /firebase deploy|deploy --only|cloudfunctions\/v2/);
});
