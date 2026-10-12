import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {
  APPROVED_STAGING_FUNCTIONS,
  assertOneFunctionMigrationPlan,
} from "../../scripts/staging/migrate-one-function.mjs";

const expectedFunctions=[
  "closePracticeSession","completePracticeDailyGrind","createOrRecoverCanonicalPractice",
  "finalizePracticeAttendance","getPracticeAttendanceReview","getPracticeSession",
  "openPracticeSession","saveDailyPracticeLog","savePracticeAthleteInput",
  "savePracticeSessionMemory","skillCheckCoachCall","updatePracticeCheckIn",
];
const commit="a".repeat(40);

function input(overrides={}){
  return {functionName:"getPracticeSession",approvedCommit:commit,currentCommit:commit,
    projectId:"sandman-combat-staging",acknowledgement:"sandman-combat-staging",
    confirmation:"MIGRATE:getPracticeSession:sandman-combat-staging",...overrides};
}

test("migration allowlist contains exactly the 12 reviewed staging functions",()=>{
  assert.deepEqual([...APPROVED_STAGING_FUNCTIONS].sort(),expectedFunctions.sort());
});

test("one-function migration plan is exact, staging-only, and nondeploying by default",async()=>{
  const plan=await assertOneFunctionMigrationPlan(input());
  assert.equal(plan.mode,"validate");
  assert.equal(plan.deployTarget,"functions:getPracticeSession");
  assert.equal(plan.configPath,"firebase.staging.json");
  assert.equal(plan.expectedRuntimeIdentity,
    "sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com");
  assert.doesNotMatch(plan.deployTarget,/hosting|firestore|storage|rules|seed/i);
});

test("migration plan rejects production, arbitrary projects, missing confirmation, unsupported functions, and commit drift",async()=>{
  await assert.rejects(assertOneFunctionMigrationPlan(input({projectId:"sandmandashboard"})),/exact approved staging/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({projectId:"other-stage"})),/exact approved staging/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({acknowledgement:""})),/acknowledgement/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({confirmation:""})),/confirmation/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({functionName:"hosting",
    confirmation:"MIGRATE:hosting:sandman-combat-staging"})),/Exactly one approved/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({currentCommit:"b".repeat(40)})),/exact current/);
});

test("migration implementation cannot seed data, mutate IAM, or broaden Firebase targets",async()=>{
  const source=await readFile(new URL("../../scripts/staging/migrate-one-function.mjs",import.meta.url),"utf8");
  assert.match(source,/"--only",plan\.deployTarget/);
  assert.match(source,/`functions:\$\{functionName\}`/);
  assert.doesNotMatch(source,/seed-wrestling|firestore:rules|storage|set-iam-policy|add-iam-policy-binding/);
  assert.doesNotMatch(source,/firebase-tools@(?:latest|\*)/);
});

test("reviewed callable source retains authentication gates and no AUTO eligibility",async()=>{
  const [practice,skill,fixture]=await Promise.all([
    readFile(new URL("../../functions/src/practice/practiceSessions.ts",import.meta.url),"utf8"),
    readFile(new URL("../../functions/src/modules/skillCheckCoachCall.ts",import.meta.url),"utf8"),
    readFile(new URL("../../functions/scripts/historical-certification-fixtures.mjs",import.meta.url),"utf8"),
  ]);
  assert.equal((practice.match(/if \(!request\.auth\)/g)||[]).length,11);
  assert.match(skill,/if \(!req\.auth\)/);
  assert.match(skill,/requireActiveStaff/);
  assert.match(practice,/requireActiveStaff/);
  assert.match(fixture,/eligibleForAuto:false/);
  assert.match(fixture,/xpAwarded:false/);
  assert.match(fixture,/promotionApplied:false/);
});
