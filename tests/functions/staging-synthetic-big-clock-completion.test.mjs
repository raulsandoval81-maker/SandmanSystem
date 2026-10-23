import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(repo, file), "utf8");
const service = read("functions/src/staging/syntheticPracticeCompletion.ts");
const stagingEntry = read("functions/src/staging.ts");
const productionEntry = read("functions/src/index.ts");
const clock = read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js");
const clockHtml = read("public/coaches/execution/big-clock-2.0/index.html");
const seed = read("functions/scripts/seed-wrestling-staging.mjs");
const lifecycle = read("functions/src/practice/practiceSessions.ts");
const stagingDeploy = read("scripts/staging/deploy-staging.mjs");

test("synthetic completion is exported only by the staging Functions entry", () => {
  assert.match(stagingEntry, /completeSyntheticPracticeForTesting/);
  assert.match(stagingDeploy, /functions:completeSyntheticPracticeForTesting/);
  assert.doesNotMatch(productionEntry, /completeSyntheticPracticeForTesting/);
  assert.match(service, /sandman-combat-staging/);
  assert.match(service, /currentFirebaseProjectId\(\) !== STAGING_PROJECT_ID/);
});

test("server requires verified Coach auth, scope, ownership, and explicit confirmation", () => {
  assert.match(service, /sign_in_provider === "anonymous"/);
  assert.match(service, /email_verified !== true/);
  assert.match(service, /requireActiveStaff\(request\.auth!\.uid, COACH_STAFF_ROLES/);
  assert.match(service, /requireStaffLocation\(actor, locationId\)/);
  assert.match(service, /requireCoachAthleteAccess\(actor, athlete\)/);
  assert.match(service, /practice\.coachUid[^\n]+actor\.uid/);
  assert.match(service, /COMPLETE SYNTHETIC TEST SESSION/);
});

test("server fails closed unless practice, attendance, and one athlete are explicitly synthetic-designated", () => {
  for (const marker of [
    "practice.synthetic !== true",
    "attendance.synthetic !== true",
    "athlete.synthetic !== true",
    "practice.syntheticTestCompletionEnabled !== true",
    "attendance.syntheticTestCompletionEnabled !== true",
    "athlete.syntheticTestXpEnabled !== true",
    "checkedInIds.length !== 1",
  ]) assert.ok(service.includes(marker), marker);
  assert.match(seed, /staging-synthetic-clock-practice/);
  assert.match(seed, /syntheticTestAthleteId: syntheticClockAthlete/);
  assert.match(seed, /checkedInIds: \[syntheticClockAthlete\]/);
});

test("synthetic evidence records no real minutes or worked cards and retries are idempotent", () => {
  assert.match(service, /synthetic: true/);
  assert.match(service, /realTraining: false/);
  assert.match(service, /minutesWorked: 0/);
  assert.match(service, /workedCards: \[\]/);
  assert.match(service, /prior\?\.synthetic === true/);
  assert.match(service, /idempotent = true/);
  assert.doesNotMatch(service, /authoritativeXpService|dispatchAuthoritativeXp|incrementXp/);
});

test("canonical attendance is restricted to the designated athlete after authoritative completion", () => {
  assert.match(lifecycle, /function requireSyntheticTestRoster/);
  assert.match(lifecycle, /Synthetic test attendance is restricted to its designated test athlete/);
  assert.match(lifecycle, /Authoritative synthetic completion evidence is required before attendance finalization/);
  assert.match(lifecycle, /practice\.syntheticTestCompletionEnabled !== true\s*\|\| athlete\.athleteId/);
  assert.match(lifecycle, /requireSyntheticTestRoster\(practice, requestedPresentIds, true\)/);
});

test("Big Clock exposes the control only after staging, Coach, and authoritative record checks", () => {
  assert.match(clockHtml, /Complete Test Session/);
  assert.match(clockHtml, /id="syntheticCompletionPanel" class="synthetic-completion hidden"/);
  assert.match(clock, /runtimeEnvironment !== "staging"/);
  assert.match(clock, /await requireCoach\(\)/);
  assert.match(clock, /httpsCallable\(functions, "getPracticeSession"\)/);
  assert.match(clock, /practice\.synthetic !== true \|\| practice\.syntheticTestCompletionEnabled !== true/);
  assert.match(clock, /window\.confirm/);
  assert.match(clock, /const practiceId = currentRunIdentity\(\)\.practiceId/);
});

test("refresh restores only authoritative synthetic evidence and never writes normal worked memory", () => {
  assert.match(clock, /practice\.sessionMemory\?\.syntheticExecution\?\.synthetic === true/);
  assert.match(clock, /Synthetic test only · 0 training minutes · no worked cards/);
  const completionBody = clock.slice(clock.indexOf("async function completeSyntheticTestSession"), clock.indexOf("function getActiveDrill"));
  assert.doesNotMatch(completionBody, /updateDurableWorkedMemory/);
  assert.match(completionBody, /completeSyntheticPracticeForTesting/);
});
