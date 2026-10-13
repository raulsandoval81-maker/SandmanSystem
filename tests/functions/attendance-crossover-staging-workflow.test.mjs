import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL(
  "../../.github/workflows/deploy-attendance-crossover-staging.yml",
  import.meta.url
);

test("Attendance staging workflow pins the authorized release and staging identity", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /c37cbd2cb969e870cdc23ce69f076a56a945a565/);
  assert.match(source, /test "\$\(git rev-parse HEAD\)" = "\$\{RELEASE_COMMIT\}"/);
  assert.match(source, /environment: staging/);
  assert.match(source, /group: sandman-staging-deployment/);
  assert.match(source, /projects\/991554514268\/locations\/global\/workloadIdentityPools\/sandman-github-staging\/providers\/sandman-github-actions/);
  assert.match(source, /service_account: sandman-staging-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
  assert.match(source, /actions: read/);
});

test("backend phase can deploy only the three authorized Attendance callables", async () => {
  const source = await readFile(workflowPath, "utf8");
  const backendTarget = "functions:getPracticeAttendanceReview,functions:updatePracticeCheckIn,functions:finalizePracticeAttendance";
  assert.equal(source.split(backendTarget).length - 1, 1);
  assert.match(source, /--config firebase\.staging\.json/);
  assert.match(source, /--project sandman-combat-staging/);
  assert.doesNotMatch(source, /node scripts\/staging\/deploy-staging\.mjs/);
  assert.doesNotMatch(source, /seed-wrestling-staging/);
  assert.doesNotMatch(source, /--only firestore:rules/);
  assert.doesNotMatch(source, /--only storage/);
  assert.doesNotMatch(source, /functions:skillCheckCoachCall/);
  assert.doesNotMatch(source, /functions:completePracticeDailyGrind/);
});

test("Hosting is a separate manual phase and never accompanies Functions", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /hosting-after-smoke/);
  assert.match(source, /backend_run_id:/);
  assert.doesNotMatch(source, /confirm_backend_smoke|backend_smoke_evidence/);
  assert.match(source, /inputs\.release_phase == 'hosting-after-smoke'/);
  assert.match(source, /--only hosting\s+--non-interactive/);
  assert.doesNotMatch(source, /--only hosting,/);
  assert.doesNotMatch(source, /--only [^\n]*hosting[^\n]*functions:/);
});

test("backend phase publishes an API-verifiable immutable deployment reference", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /attendance-crossover-backend-deployment/);
  assert.match(source, /actions\/upload-artifact@v4/);
  assert.match(source, /backendRunId: process\.env\.GITHUB_RUN_ID/);
  assert.match(source, /workflowSha: process\.env\.GITHUB_SHA/);
  assert.match(source, /deploymentResult: "success"/);
});

test("Hosting authenticates the referenced run and artifact provenance through GitHub API", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(source, /actions\/runs\/\$\{BACKEND_RUN_ID\}/);
  assert.match(source, /actions\/runs\/\$\{BACKEND_RUN_ID\}\/artifacts/);
  assert.match(source, /actions\/artifacts\/\$\{deployment_artifact_id\}\/zip/);
  assert.match(source, /actions\/artifacts\/\$\{smoke_artifact_id\}\/zip/);
  assert.doesNotMatch(source, /SMOKE_EVIDENCE|manually supplied JSON/);
});

test("Hosting rejects missing evidence and fabricated artifact names", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /matches\.length !== 1/);
  assert.match(source, /item\.expired !== true/);
  assert.match(source, /attendance-crossover-smoke-evidence/);
  assert.match(source, /Expected exactly one unexpired/);
});

test("Hosting rejects wrong repository, workflow, SHA, phase, and failed backend run", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /run\.repository\?\.full_name !== process\.env\.EXPECTED_REPOSITORY/);
  assert.match(source, /run\.path !== process\.env\.EXPECTED_WORKFLOW_PATH/);
  assert.match(source, /run\.inputs\?\.release_phase !== "backend-functions"/);
  assert.match(source, /run\.head_sha !== process\.env\.EXPECTED_WORKFLOW_SHA/);
  assert.match(source, /run\.status !== "completed" \|\| run\.conclusion !== "success"/);
});

test("Hosting rejects wrong release metadata and every required failed smoke check", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /releaseCommit: process\.env\.RELEASE_COMMIT/);
  assert.match(source, /projectId: process\.env\.SANDMAN_STAGING_PROJECT_ID/);
  assert.match(source, /backendRunId: String\(process\.env\.BACKEND_RUN_ID\)/);
  assert.match(source, /smoke\.result !== "passed"/);
  for (const check of ["approvedVisitor", "unauthorizedVisitor", "checkIn", "finalization", "athleteIdentityPreserved"]) {
    assert.match(source, new RegExp(`"${check}"`));
  }
  assert.match(source, /smoke\.checks\?\.\[check\] !== true/);
});

test("Hosting remains fail-closed because no smoke-evidence producer exists yet", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.doesNotMatch(source, /name: attendance-crossover-smoke-evidence\s*$/m);
  assert.match(source, /exactArtifact\("attendance-crossover-smoke-evidence"\)/);
});

test("workflow verifies boundary, build, Attendance tests, and isolated artifacts before deployment", async () => {
  const source = await readFile(workflowPath, "utf8");
  const boundary = source.indexOf("node scripts/staging/verify-staging-boundary.mjs");
  const prepare = source.indexOf("node scripts/staging/prepare-staging-hosting.mjs");
  const deploy = source.indexOf("firebase-tools@15.11.0 deploy");
  assert.ok(boundary > 0 && prepare > boundary && deploy > prepare);
  assert.match(source, /npm --prefix functions run build/);
  assert.match(source, /practice-entry-attendance-phase2\.test\.mjs/);
  assert.match(source, /practice-closeout-phase4\.test\.mjs/);
  assert.match(source, /p\.main!=='lib\/staging\.js'/);
});
