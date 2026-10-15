import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../../.github/workflows/change-c-controlled-canary.yml", import.meta.url),
  "utf8",
);
const functionJob = workflow.slice(
  workflow.indexOf("  deploy-cross-location-function:"),
  workflow.indexOf("  deploy-cross-location-hosting:"),
);
const hostingJob = workflow.slice(workflow.indexOf("  deploy-cross-location-hosting:"));
const sourceSha = "dc60d8d83c3ea27c27382545bcd81b4dff202aff";

test("cross-location scopes pin the exact reviewed PR #93 source", () => {
  assert.match(workflow, new RegExp(`cross_location_source_sha:[\\s\\S]*default: ${sourceSha}`));
  assert.match(functionJob, new RegExp(`SANDMAN_AUTHORIZED_CROSS_LOCATION_SHA: ${sourceSha}`));
  assert.match(hostingJob, new RegExp(`SANDMAN_AUTHORIZED_CROSS_LOCATION_SHA: ${sourceSha}`));
  assert.match(functionJob, new RegExp(`ref: ${sourceSha}`));
  assert.match(hostingJob, new RegExp(`ref: ${sourceSha}`));
  assert.match(functionJob, /git archive "\$\{SANDMAN_AUTHORIZED_CROSS_LOCATION_SHA\}"/);
  assert.match(hostingJob, /git archive "\$\{SANDMAN_AUTHORIZED_CROSS_LOCATION_SHA\}"/);
});

test("function scope authorizes only the three reviewed attendance callables", () => {
  assert.match(functionJob, /getPracticeAttendanceReview\|updatePracticeCheckIn\|finalizePracticeAttendance/);
  assert.match(functionJob, /service_account: sandman-attendance-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(functionJob, /SANDMAN_ATTENDANCE_BUILD: sandman-attendance-build@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(functionJob, /SANDMAN_ATTENDANCE_RUNTIME: sandman-attendance-runtime@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(functionJob, /SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT: sandman-wrestling-runtime@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(functionJob, /verifyStagingBoundary\(process\.env, process\.env\.SANDMAN_ATTENDANCE_RUNTIME\)/);
  assert.match(functionJob, /gcloud functions deploy "\$\{FUNCTION_NAME\}"/);
  assert.match(functionJob, /emulators:exec[\s\S]*cross-location-attendance\.test\.mjs/);
  assert.doesNotMatch(functionJob, /--only functions/);
  assert.doesNotMatch(functionJob, /functions deploy getPracticeSession/);
});

test("function deployment preserves branch-bound WIF, exact project, and callable transport gate", () => {
  assert.match(functionJob, /refs\/heads\/release\/change-c-canary-dispatcher/);
  assert.match(functionJob, /sandman-github-staging\/providers\/sandman-github-actions/);
  assert.match(functionJob, /environment: change-c-staging-canary/);
  assert.match(functionJob, /CALLABLE_TRANSPORT:\$\{SANDMAN_STAGING_PROJECT_ID\}:\$\{SANDMAN_STAGING_PROJECT_NUMBER\}:\$\{FUNCTION_NAME\}:NO_INVOKER_IAM_CHECK/);
  assert.match(functionJob, /--project="\$\{SANDMAN_STAGING_PROJECT_ID\}"/);
  assert.match(functionJob, /test "\$\{SANDMAN_STAGING_PROJECT_ID\}" != "sandmandashboard"/);
  assert.match(functionJob, /test "\$\(git status --porcelain=v1 --untracked-files=all\)" = ""/);
});

test("Hosting deploys only the reviewed frontend to staging", () => {
  assert.match(hostingJob, /service_account: sandman-staging-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(hostingJob, /cmp public\/coaches\/attendance\/session\.js \.firebase-staging\/public\/coaches\/attendance\/session\.js/);
  assert.match(hostingJob, /--project sandman-combat-staging/);
  assert.match(hostingJob, /--only hosting/);
  assert.doesNotMatch(hostingJob, /--only (?:functions|firestore|storage)/);
  assert.match(hostingJob, /test "\$\{SANDMAN_STAGING_PROJECT_ID\}" != "sandmandashboard"/);
  assert.doesNotMatch(hostingJob, /--project sandmandashboard/);
});

test("legacy Change C and staging Hosting jobs remain independently pinned", () => {
  assert.match(workflow, /SANDMAN_AUTHORIZED_FUNCTION: getPracticeSession/);
  assert.match(workflow, /SANDMAN_AUTHORIZED_RELEASE_SHA: 6ca5309c2f7149468b0b45efc18c0271fd5cd311/);
  assert.match(workflow, /SANDMAN_AUTHORIZED_HOSTING_SOURCE_SHA: ccdac82cca2af454192f312da89b819830836411/);
});
