const assert=require("node:assert/strict");
const test=require("node:test");

const STAGING_PROJECT="sandman-combat-staging";
const RUNTIME_ACCOUNTS={
  attendance:"sandman-attendance-runtime@sandman-combat-staging.iam.gserviceaccount.com",
  practice:"sandman-practice-runtime@sandman-combat-staging.iam.gserviceaccount.com",
  progression:"sandman-progression-runtime@sandman-combat-staging.iam.gserviceaccount.com",
};
const stagingEnvironment={
  SANDMAN_STAGING_PROJECT_ID:STAGING_PROJECT,
  SANDMAN_STAGING_ACK:STAGING_PROJECT,
  SANDMAN_ATTENDANCE_RUNTIME_SERVICE_ACCOUNT:RUNTIME_ACCOUNTS.attendance,
  SANDMAN_PRACTICE_RUNTIME_SERVICE_ACCOUNT:RUNTIME_ACCOUNTS.practice,
  SANDMAN_PROGRESSION_RUNTIME_SERVICE_ACCOUNT:RUNTIME_ACCOUNTS.progression,
  GCLOUD_PROJECT:STAGING_PROJECT,
};

Object.assign(process.env,stagingEnvironment);

const runtime=require("../lib/config/functionRuntime");
const practice=require("../lib/practice/practiceSessions");
const skill=require("../lib/modules/skillCheckCoachCall");

const functions={
  closePracticeSession:[practice.closePracticeSession,"practice"],
  completePracticeDailyGrind:[practice.completePracticeDailyGrind,"progression"],
  createOrRecoverCanonicalPractice:[practice.createOrRecoverCanonicalPractice,"practice"],
  finalizePracticeAttendance:[practice.finalizePracticeAttendance,"attendance"],
  getPracticeAttendanceReview:[practice.getPracticeAttendanceReview,"attendance"],
  getPracticeSession:[practice.getPracticeSession,"practice"],
  openPracticeSession:[practice.openPracticeSession,"practice"],
  saveDailyPracticeLog:[practice.saveDailyPracticeLog,"practice"],
  savePracticeAthleteInput:[practice.savePracticeAthleteInput,"practice"],
  savePracticeSessionMemory:[practice.savePracticeSessionMemory,"practice"],
  skillCheckCoachCall:[skill.skillCheckCoachCall,"progression"],
  updatePracticeCheckIn:[practice.updatePracticeCheckIn,"attendance"],
};

test("all 12 generated staging callables request the dedicated runtime account",()=>{
  assert.equal(Object.keys(functions).length,12);
  for(const [name,[callable,group]] of Object.entries(functions)){
    assert.equal(callable.__endpoint?.serviceAccountEmail,RUNTIME_ACCOUNTS[group],name);
    assert.ok(callable.__endpoint?.callableTrigger,name);
  }
});

test("staging runtime discovery fails closed and production or emulator discovery remains unchanged",()=>{
  assert.deepEqual(runtime.resolveStagingCallableRuntimeOptions("attendance",stagingEnvironment),
    {serviceAccount:RUNTIME_ACCOUNTS.attendance});
  assert.deepEqual(runtime.resolveStagingCallableRuntimeOptions("practice",{
    GCLOUD_PROJECT:"sandmandashboard",
    FIREBASE_CONFIG:JSON.stringify({projectId:"sandmandashboard"}),
  }),{});
  assert.deepEqual(runtime.resolveStagingCallableRuntimeOptions("practice",{GCLOUD_PROJECT:"demo-sandman"}),{});
  for(const env of [
    {GCLOUD_PROJECT:STAGING_PROJECT},
    {...stagingEnvironment,SANDMAN_STAGING_ACK:""},
    {...stagingEnvironment,SANDMAN_STAGING_PROJECT_ID:"sandmandashboard"},
    {...stagingEnvironment,SANDMAN_PRACTICE_RUNTIME_SERVICE_ACCOUNT:"wrong@example.invalid"},
    {...stagingEnvironment,GCLOUD_PROJECT:"sandmandashboard"},
  ]) assert.throws(()=>runtime.resolveStagingCallableRuntimeOptions("practice",env),/staging|runtime|platform/i);
});

test("every staging callable rejects missing Firebase authentication before data access",async()=>{
  for(const [name,[callable]] of Object.entries(functions)){
    await assert.rejects(callable.run({auth:null,data:{}}),error=>{
      assert.equal(error.code,"unauthenticated",name);
      return true;
    });
  }
});
