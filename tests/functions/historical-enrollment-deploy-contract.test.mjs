import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const script = read("scripts/staging/historical-enrollment-guarded-deploy.py");
const yaml = read(".github/workflows/historical-enrollment-staging-deploy.yml");
const legacy = read(".github/workflows/staging-exact-sha-release.yml");
const begin = yaml.indexOf("\n  historical-enrollment-guarded-deploy:\n");
const job = yaml.slice(begin);

test("only approved three-function/three-file staging surface with exact SHA and explicit action", () => {
  assert.ok(begin > 0);
  assert.match(job, /environment: staging/);
  assert.match(job, /concurrency: sandman-staging-hosting/);
  assert.match(job, /ref: 3b89bffed91d6e1698503b813f14340c2440f240/);
  assert.match(script, /SHA = "3b89bffed91d6e1698503b813f14340c2440f240"/);
  assert.match(script, /PREFLIGHT_RUN = "44856250072"/);
  assert.match(script, /APPROVE_HISTORICAL_ENROLLMENT_STAGING_THREE_FUNCTIONS_THREE_FILES/);
  assert.match(script, /"GITHUB_RUN_ATTEMPT": "1"/);
  assert.match(script, /historical-enrollment-staging-deploy\.yml@refs\/heads\/main/);
  for (const name of ["createProposalDraft", "recordProposalPrepaidCash", "sendEnrollmentIntakeEmail"]) {
    assert.ok(script.includes('"' + name + '"'));
  }
  assert.match(script, /set\(preflight\.ASSETS\) == \{/);
  assert.doesNotMatch(script, /sandmandashboard|stripe\.com|send_email|firestore.*write/i);
});

test("release is fail-closed for baseline, source provenance, IAM and Hosting drift", () => {
  for (const part of [
    'configurationSha256', 'rollbackArchiveSha256', 'functionIamSha256',
    'runIamSha256', 'fileSetSha256', 'manifestSha256',
    'overlayManifestSha256', 'verify_updated_runtime',
    'release.archive_hashes(delivered) == release.archive_hashes(candidate_archive)',
    'active_hosting(hosting_token)', 'STOP_NO_RETRY',
  ]) assert.ok(script.includes(part), 'Missing release gate: ' + part);
  assert.match(script, /"attemptedFunctions": \[\]/);
  assert.match(script, /"productionTouched": False/);
  assert.match(script, /"HOSTING_PUBLICATION_ATTEMPTED"/);
  assert.match(script, /"STAGING_PUBLISHED_VERIFIED"/);
});

test("all three candidate package pins exactly match preflight #44856250072", () => {
  const expectedPins = {
    createProposalDraft: "c7803405b1ba7f5ac2e8c88e3597c7a2629aae5070b462056c443c40a48302d3",
    sendEnrollmentIntakeEmail: "9c9f9de9515fa33948d6f3ecafeaaa7b7dd33b109af643f139eec43077dd7daf",
    recordProposalPrepaidCash: "4f14dddf3bb4ce227990b9a7cf6a26a40de888fecef7898d480d03777fcc2cb6",
  };
  for (const [name, hash] of Object.entries(expectedPins)) {
    const functionSection = script.split('"' + name + '": {')[1]?.split('\n    },')[0];
    assert.ok(functionSection, 'Missing baseline for ' + name);
    assert.ok(functionSection.includes('"fileSetSha256": "' + hash + '"'),
      'Incorrect approved candidate SHA-256 for ' + name);
  }
});

test("deployment is protected, tests before auth, and uses segregated existing staging identities", () => {
  assert.match(job, /can_admins_bypass == false/);
  assert.match(job, /DEPLOY_APPROVAL: \$\{\{ inputs\.deployment_approval \}\}/);
  assert.match(job, /CONFIRM_SOURCE_SHA: \$\{\{ inputs\.approved_source \}\}/);
  assert.match(job, /CONFIRM_PREFLIGHT_RUN: \$\{\{ inputs\.preflight_run \}\}/);
  assert.match(job, /prepaidEnrollment\.integration\.cjs/);
  assert.match(job, /historical-enrollment-deploy-contract\.test\.mjs/);
  assert.match(job, /service_account: sandman-practice-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(job, /service_account: sandman-staging-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(job, /export_environment_variables: false/);
  assert.match(job, /HOSTING_CREDENTIALS_FILE: \$\{\{ steps\.historical-deploy-hosting-auth\.outputs\.credentials_file_path \}\}/);
  const testPos = job.indexOf("Rerun isolated cash/check concurrency");
  const authPos = job.indexOf("google-github-actions/auth@v3");
  assert.ok(testPos > 0 && authPos > testPos, "No staging auth before tests");
  assert.doesNotMatch(job, /gcloud functions deploy|firebase deploy|gcloud projects add-iam-policy-binding/);
});

test("dedicated workflow has four dispatch inputs and restores legacy 25-input limit", () => {
  const dispatch = yaml.split("    inputs:\n")[1].split("\npermissions:")[0];
  const names = dispatch.split("\n").filter(line => /^      [a-zA-Z_][a-zA-Z0-9_-]*:\s*$/.test(line));
  assert.equal(names.length, 4);
  assert.match(yaml, /HISTORICAL_ENROLLMENT_ACTION: historical-enrollment-guarded-deploy/);
  assert.doesNotMatch(job, /inputs\.action/);
  const oldDispatch = legacy.split("    inputs:\n")[1].split("\npermissions:")[0];
  assert.equal(oldDispatch.split("\n").filter(line => /^      [a-zA-Z_][a-zA-Z0-9_-]*:\s*$/.test(line)).length, 25);
  assert.doesNotMatch(legacy, /historical_enrollment_deployment_approval|historical_enrollment_approved_source|historical_enrollment_preflight_run/);
  assert.doesNotMatch(legacy, /  historical-enrollment-guarded-deploy:/);
});
