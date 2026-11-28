import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/staging-exact-sha-release.yml", "utf8");
const overlay = readFileSync("scripts/staging/pr834-hosting-overlay.mjs", "utf8");
const candidate = "94e27e3561301d09e9b93be6125f07c0d0139635";
const approved = "APPROVE_SPRINT2_SETTINGS_TWO_FILE_STAGING_ONLY";
const profileStart = overlay.indexOf("  sprint2settings: {");
const profileEnd = overlay.indexOf("\n  },", profileStart);
const profile = overlay.slice(profileStart, profileEnd);
const start = workflow.indexOf("  athlete-sprint2-settings-overlay:");
const end = workflow.indexOf("\n  pr837-hosting-overlay:", start);
const job = workflow.slice(start, end);

test("exact Sprint 2 assets pinned to merged Git blobs; no photograph uploads", () => {
  assert.ok(profileStart > 0 && profileEnd > profileStart);
  assert.match(profile, new RegExp(candidate));
  assert.match(profile, new RegExp(approved));
  assert.match(profile, /\/assets\/js\/athlete-nav\.js/);
  assert.match(profile, /blob:5394d15e2cd4dfc9ca28bfa2b9509354a39c50eb/);
  assert.match(profile, /\/assets\/css\/athlete-ui\.css/);
  assert.match(profile, /blob:c5e0b946496d39d370e622c9aa7bdfa06a327790/);
  assert.equal((profile.match(/\['\//g) || []).length, 2);
  assert.doesNotMatch(profile, /avatar|photo|storage\.rules|\.jpg|\.png|\.webp/i);
});

test("protected preflight and deploy are separate, first-attempt-only, staging-only", () => {
  assert.ok(start > 0 && end > start);
  assert.match(workflow, /- athlete-sprint2-settings-preflight/);
  assert.match(workflow, /- athlete-sprint2-settings-deploy/);
  assert.match(job, /environment: staging/);
  assert.match(job, /concurrency: sandman-staging-hosting/);
  assert.match(job, /GITHUB_RUN_ATTEMPT/);
  assert.match(job, /GITHUB_WORKFLOW_REF/);
  assert.match(job, /confirm_project/);
  assert.match(job, /protected_2c_deployment_approval/);
  assert.match(job, /protected_2c_expected_hosting_release/);
  assert.match(job, /protected_2c_expected_hosting_version/);
  assert.match(job, new RegExp(candidate));
  assert.match(job, new RegExp(approved));
  assert.match(job, /P0_HOSTING_PROFILE: sprint2settings/);
  assert.doesNotMatch(job, /firebase deploy|deploy --only|cloudfunctions\/v2/);
});

test("the manifest-preserving overlay rejects changed baselines and unrelated uploads", () => {
  for(const guard of [
    "assert.deepEqual(await activeRelease(), baseline",
    "assert.deepEqual(await manifest(created.name), proposed)",
    "assert.deepEqual(await manifest(after.version), proposed)",
    "assert.deepEqual(changedPaths, [...targets.keys()].sort())",
    "const proposed = new Map(live)",
    "Hosting requested an unrelated upload",
    "assert.deepEqual(baseline, {"
  ]) assert.ok(overlay.includes(guard), guard);
});
