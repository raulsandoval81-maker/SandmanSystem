import assert from "node:assert/strict";
import {mkdtemp,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {assertStagingDeploymentPlan,ALLOWED_STAGING_DEPLOY_TARGETS}
  from "../../scripts/staging/assert-staging-plan.mjs";
import {assertEmulatorCertificationEnvironment,certificationCommands}
  from "../../scripts/staging/run-certification-emulator.mjs";
import {analyzeHistoricalEvidence,authorizeHistoricalInspection}
  from "../../functions/scripts/inspect-historical-evidence.mjs";
import {buildSyntheticCertificationFixtures}
  from "../../functions/scripts/historical-certification-fixtures.mjs";

test("staging deployment plan is exact, narrow, and production-fail-closed",async()=>{
  const plan=await assertStagingDeploymentPlan({projectId:"sandman-combat-staging",
    acknowledgement:"sandman-combat-staging",confirmation:"DEPLOY:sandman-combat-staging"});
  assert.equal(plan.hostingSite,"sandman-combat-staging");
  assert.deepEqual(plan.targets,ALLOWED_STAGING_DEPLOY_TARGETS);
  for(const projectId of ["sandmandashboard","other-stage",""]){
    await assert.rejects(assertStagingDeploymentPlan({projectId,
      acknowledgement:projectId,confirmation:`DEPLOY:${projectId}`}),/exact approved staging/);
  }
  await assert.rejects(assertStagingDeploymentPlan({projectId:"sandman-combat-staging",
    acknowledgement:"sandman-combat-staging",confirmation:"DEPLOY:sandman-combat-staging",
    targets:["functions"]}),/approved staging surface/);
});

test("historical inspector defaults only to demo emulator or verified staging",async()=>{
  assert.deepEqual(await authorizeHistoricalInspection({FIRESTORE_EMULATOR_HOST:"127.0.0.1:8081",
    GCLOUD_PROJECT:"demo-sandman-history"}),{mode:"emulator",projectId:"demo-sandman-history"});
  await assert.rejects(authorizeHistoricalInspection({FIRESTORE_EMULATOR_HOST:"127.0.0.1:8081",
    GCLOUD_PROJECT:"sandmandashboard"}),/demo-/);
  await assert.rejects(authorizeHistoricalInspection({GCLOUD_PROJECT:"sandmandashboard"}),
    /explicit staging-only confirmation/);
  const directory=await mkdtemp(path.join(os.tmpdir(),"batch-e-inspection-"));
  const credentialPath=path.join(directory,"credential.json");
  const email="sandman-staging-deployer@sandman-combat-staging.iam.gserviceaccount.com";
  await writeFile(credentialPath,JSON.stringify({type:"service_account",project_id:"sandman-combat-staging",
    client_email:email,private_key:"-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----"}));
  const authorized=await authorizeHistoricalInspection({
    SANDMAN_STAGING_PROJECT_ID:"sandman-combat-staging",SANDMAN_STAGING_ACK:"sandman-combat-staging",
    SANDMAN_STAGING_INSPECTION_CONFIRM:"INSPECT:sandman-combat-staging",
    SANDMAN_STAGING_SERVICE_ACCOUNT_EMAIL:email,
    SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT:"sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com",
    GOOGLE_APPLICATION_CREDENTIALS:credentialPath});
  assert.deepEqual(authorized,{mode:"staging",projectId:"sandman-combat-staging"});
});

test("read-only inspector identifies canonical, orphan, attendance, scope, and discipline defects",()=>{
  const result=analyzeHistoricalEvidence({
    athletes:[{path:"athletes/A",data:{locationId:"home",previousLocationIds:[]}}],
    practices:[{path:"practiceSessions/P",data:{discipline:"wrestling",locationId:"other"}}],
    attendance:[{path:"attendance_sessions/P",data:{practiceId:"P",status:"finalized",finalized:true,presentIds:[]}}],
    memories:[{path:"practiceSessions/P/athletes/A",data:{practiceId:"wrong",athleteId:"",discipline:"boxing"}}],
    skills:[{path:"practiceSessions/ORPHAN/athletes/A/verifiedSkills/x",data:{discipline:"boxing"}}],
    assignments:[]});
  assert.equal(result.readOnly,true);
  for(const code of ["memory-canonical-identity-missing-or-mismatched","memory-discipline-mismatch",
    "attendance-to-memory-mismatch","historical-scope-conflict","orphaned-verified-skill",
    "verified-skill-discipline-mismatch"]){
    assert.ok(result.issues.some(issue=>issue.code===code),code);
  }
});

test("synthetic fixture manifest covers every Batch E scenario deterministically",()=>{
  const first=buildSyntheticCertificationFixtures(),second=buildSyntheticCertificationFixtures();
  assert.deepEqual(first,second);
  assert.equal(first.syntheticOnly,true);
  assert.equal(first.scenarios.largeResumable.practiceCount,55);
  assert.equal(first.scenarios.largeResumable.priorLocationCount,11);
  for(const key of ["smallComplete","largeResumable","missingCanonicalMemory",
    "missingAttendanceMembership","conflictingObservations","sourceRevisionMutation",
    "staleReviewIdentity","interruptedCertification","revocationAfterAcceptance"]){
    assert.ok(first.scenarios[key],key);
  }
  assert.ok(first.documents.every(item=>item.data.synthetic===true));
});

test("certification runner is emulator-only and preserves required suites",()=>{
  assert.equal(assertEmulatorCertificationEnvironment({GCLOUD_PROJECT:"demo-batch-e"}),"demo-batch-e");
  for(const projectId of ["sandmandashboard","sandman-combat-staging","other"]){
    assert.throws(()=>assertEmulatorCertificationEnvironment({GCLOUD_PROJECT:projectId}),/emulator-only/);
  }
  const commands=certificationCommands("demo-batch-e").map(parts=>parts.join(" ")).join("\n");
  assert.match(commands,/test:integration/);
  assert.match(commands,/historicalAuthority\.rules\.cjs/);
  assert.doesNotMatch(commands,/deploy/);
});
