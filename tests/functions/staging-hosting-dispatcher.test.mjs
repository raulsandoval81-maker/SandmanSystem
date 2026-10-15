import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../.github/workflows/change-c-controlled-canary.yml", import.meta.url),
  "utf8"
);
const functionJob = workflow.slice(
  workflow.indexOf("  deploy-one:"),
  workflow.indexOf("  deploy-staging-hosting:")
);
const hostingJob = workflow.slice(workflow.indexOf("  deploy-staging-hosting:"));

test("protected dispatcher selects exactly one independently reviewed deployment scope", () => {
  assert.match(workflow, /deployment_scope:[\s\S]*- change-c-function[\s\S]*- staging-hosting/);
  assert.match(functionJob, /if: inputs\.deployment_scope == 'change-c-function'/);
  assert.match(hostingJob, /if: inputs\.deployment_scope == 'staging-hosting'/);
  assert.match(functionJob, /--function getPracticeSession/);
});

test("Hosting uses the existing WIF-authorized branch, workflow environment, and staging identity", () => {
  assert.match(hostingJob, /environment: change-c-staging-canary/);
  assert.match(hostingJob, /refs\/heads\/release\/change-c-canary-dispatcher/);
  assert.match(hostingJob, /sandman-github-staging\/providers\/sandman-github-actions/);
  assert.match(hostingJob, /service_account: sandman-staging-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(hostingJob, /test "\$\{GITHUB_REF\}" = "\$\{SANDMAN_AUTHORIZED_WORKFLOW_REF\}"/);
});

test("Hosting source is the immutable approved production merge", () => {
  const approved = "ccdac82cca2af454192f312da89b819830836411";
  assert.match(workflow, new RegExp(`hosting_source_sha:[\\s\\S]*default: ${approved}`));
  assert.match(hostingJob, new RegExp(`SANDMAN_AUTHORIZED_HOSTING_SOURCE_SHA: ${approved}`));
  assert.match(hostingJob, new RegExp(`ref: ${approved}`));
  assert.match(hostingJob, /test "\$\(git rev-parse HEAD\)" = "\$\{SANDMAN_AUTHORIZED_HOSTING_SOURCE_SHA\}"/);
});

test("Hosting deployment cannot target production, Functions, or Firestore rules", () => {
  assert.match(hostingJob, /--config firebase\.staging\.json/);
  assert.match(hostingJob, /--project sandman-combat-staging/);
  assert.match(hostingJob, /--only hosting/);
  assert.match(hostingJob, /test "\$\{SANDMAN_STAGING_PROJECT_ID\}" != "sandmandashboard"/);
  assert.doesNotMatch(hostingJob, /--only (?:functions|firestore|storage)/);
  assert.doesNotMatch(hostingJob, /firebase deploy[\s\S]*--project sandmandashboard/);
  assert.doesNotMatch(hostingJob, /seed-wrestling-staging|firestore:rules|functions:getPracticeSession/);
});

test("isolated preparation injects staging web configuration and preserves frontend parity checks", () => {
  assert.match(hostingJob, /SANDMAN_STAGING_WEB_CONFIG: '\{"projectId":"sandman-combat-staging"/);
  assert.match(hostingJob, /node scripts\/staging\/prepare-staging-hosting\.mjs/);
  assert.match(hostingJob, /runtimeEnvironment = "staging"/);
  assert.match(hostingJob, /"projectId": "sandman-combat-staging"/);
  assert.match(hostingJob, /cmp public\/coaches\/practice\/practice\.js \.firebase-staging\/public\/coaches\/practice\/practice\.js/);
  assert.match(hostingJob, /cmp public\/coaches\/practice\/entry\.js \.firebase-staging\/public\/coaches\/practice\/entry\.js/);
});
