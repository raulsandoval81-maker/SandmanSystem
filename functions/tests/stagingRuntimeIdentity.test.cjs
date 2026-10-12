const assert=require("node:assert/strict");
const test=require("node:test");

const STAGING_PROJECT="sandman-combat-staging";
const RUNTIME_ACCOUNT=
  "sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com";
const stagingEnvironment={
  SANDMAN_STAGING_PROJECT_ID:STAGING_PROJECT,
  SANDMAN_STAGING_ACK:STAGING_PROJECT,
  SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT:RUNTIME_ACCOUNT,
  GCLOUD_PROJECT:STAGING_PROJECT,
};

Object.assign(process.env,stagingEnvironment);

const runtime=require("../lib/config/functionRuntime");
const practice=require("../lib/practice/practiceSessions");
const skill=require("../lib/modules/skillCheckCoachCall");

const functions={
  closePracticeSession:practice.closePracticeSession,
  completePracticeDailyGrind:practice.completePracticeDailyGrind,
  createOrRecoverCanonicalPractice:practice.createOrRecoverCanonicalPractice,
  finalizePracticeAttendance:practice.finalizePracticeAttendance,
  getPracticeAttendanceReview:practice.getPracticeAttendanceReview,
  getPracticeSession:practice.getPracticeSession,
  openPracticeSession:practice.openPracticeSession,
  saveDailyPracticeLog:practice.saveDailyPracticeLog,
  savePracticeAthleteInput:practice.savePracticeAthleteInput,
  savePracticeSessionMemory:practice.savePracticeSessionMemory,
  skillCheckCoachCall:skill.skillCheckCoachCall,
  updatePracticeCheckIn:practice.updatePracticeCheckIn,
};

test("all 12 generated staging callables request the dedicated runtime account",()=>{
  assert.equal(Object.keys(functions).length,12);
  for(const [name,callable] of Object.entries(functions)){
    assert.equal(callable.__endpoint?.serviceAccountEmail,RUNTIME_ACCOUNT,name);
    assert.ok(callable.__endpoint?.callableTrigger,name);
  }
});

test("staging runtime discovery fails closed and production or emulator discovery remains unchanged",()=>{
  assert.deepEqual(runtime.resolveStagingCallableRuntimeOptions(stagingEnvironment),
    {serviceAccount:RUNTIME_ACCOUNT});
  assert.deepEqual(runtime.resolveStagingCallableRuntimeOptions({
    GCLOUD_PROJECT:"sandmandashboard",
    FIREBASE_CONFIG:JSON.stringify({projectId:"sandmandashboard"}),
  }),{});
  assert.deepEqual(runtime.resolveStagingCallableRuntimeOptions({GCLOUD_PROJECT:"demo-sandman"}),{});
  for(const env of [
    {GCLOUD_PROJECT:STAGING_PROJECT},
    {...stagingEnvironment,SANDMAN_STAGING_ACK:""},
    {...stagingEnvironment,SANDMAN_STAGING_PROJECT_ID:"sandmandashboard"},
    {...stagingEnvironment,SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT:"wrong@example.invalid"},
    {...stagingEnvironment,GCLOUD_PROJECT:"sandmandashboard"},
  ]) assert.throws(()=>runtime.resolveStagingCallableRuntimeOptions(env),/staging|runtime|platform/i);
});

test("every staging callable rejects missing Firebase authentication before data access",async()=>{
  for(const [name,callable] of Object.entries(functions)){
    await assert.rejects(callable.run({auth:null,data:{}}),error=>{
      assert.equal(error.code,"unauthenticated",name);
      return true;
    });
  }
});
