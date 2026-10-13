import assert from "node:assert/strict";
import {mkdir, readFile, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";
import {mkdtemp} from "node:fs/promises";
import {
  APPROVED_STAGING_FUNCTIONS,
  assertTransportReadyForDeploy,
  callableTransportEvidence,
  assertOneFunctionMigrationPlan,
  parseArguments,
} from "../../scripts/staging/migrate-one-function.mjs";
import {assertCleanRepositoryEvidence, checksumDirectory, verifyArtifactManifest} from "../../scripts/staging/artifact-integrity.mjs";
import {transportPlan} from "../../scripts/staging/configure-callable-transport.mjs";

const expectedFunctions=[
  "closePracticeSession","completePracticeDailyGrind","createOrRecoverCanonicalPractice",
  "finalizePracticeAttendance","getPracticeAttendanceReview","getPracticeSession",
  "openPracticeSession","saveDailyPracticeLog","savePracticeAthleteInput",
  "savePracticeSessionMemory","skillCheckCoachCall","updatePracticeCheckIn",
];
const commit="a".repeat(40);

function input(overrides={}){
  return {functionName:"getPracticeSession",approvedCommit:commit,currentCommit:commit,
    projectId:"sandman-combat-staging",projectNumber:"991554514268",
    runtimeServiceAccount:"sandman-practice-runtime@sandman-combat-staging.iam.gserviceaccount.com",
    acknowledgement:"sandman-combat-staging",
    confirmation:"MIGRATE:getPracticeSession:sandman-combat-staging",...overrides};
}

test("migration allowlist contains exactly the 12 reviewed staging functions",()=>{
  assert.deepEqual([...APPROVED_STAGING_FUNCTIONS].sort(),expectedFunctions.sort());
});

test("one-function migration plan is exact, staging-only, and nondeploying by default",async()=>{
  const plan=await assertOneFunctionMigrationPlan(input());
  assert.equal(plan.mode,"validate");
  assert.equal(plan.projectNumber,"991554514268");
  assert.equal(plan.deployTarget,"functions:getPracticeSession");
  assert.equal(plan.configPath,"firebase.staging.json");
  assert.equal(plan.expectedRuntimeIdentity,
    "sandman-practice-runtime@sandman-combat-staging.iam.gserviceaccount.com");
  assert.equal(plan.expectedBuildIdentity,
    "sandman-practice-build@sandman-combat-staging.iam.gserviceaccount.com");
  assert.equal(plan.expectedDeployerIdentity,
    "sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com");
  assert.doesNotMatch(plan.deployTarget,/hosting|firestore|storage|rules|seed/i);
});

test("migration plan rejects production, arbitrary projects, missing confirmation, unsupported functions, and commit drift",async()=>{
  await assert.rejects(assertOneFunctionMigrationPlan(input({projectId:"sandmandashboard"})),/exact approved staging/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({projectId:"other-stage"})),/exact approved staging/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({projectNumber:"123"})),/project number/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({runtimeServiceAccount:"991554514268-compute@developer.gserviceaccount.com"})),/dedicated staging runtime/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({acknowledgement:""})),/acknowledgement/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({confirmation:""})),/confirmation/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({functionName:"hosting",
    confirmation:"MIGRATE:hosting:sandman-combat-staging"})),/Exactly one approved/);
  await assert.rejects(assertOneFunctionMigrationPlan(input({currentCommit:"b".repeat(40)})),/exact current/);
});

test("CLI rejects missing or repeated function and commit arguments",()=>{
  assert.throws(()=>parseArguments(["--commit",commit]),/Exactly one --function/);
  assert.throws(()=>parseArguments(["--function","getPracticeSession"]),/Exactly one --commit/);
  assert.throws(()=>parseArguments(["--function","getPracticeSession","--function","closePracticeSession","--commit",commit]),/Exactly one --function/);
  assert.throws(()=>parseArguments(["--function","getPracticeSession","--commit",commit,"--commit","b".repeat(40)]),/Exactly one --commit/);
});

test("migration implementation cannot seed data, mutate IAM, or broaden Firebase targets",async()=>{
  const source=await readFile(new URL("../../scripts/staging/migrate-one-function.mjs",import.meta.url),"utf8");
  assert.match(source,/"functions","deploy",plan\.functionName/);
  assert.match(source,/--build-service-account/);
  assert.match(source,/--run-service-account/);
  assert.match(source,/`functions:\$\{functionName\}`/);
  assert.doesNotMatch(source,/seed-wrestling|firestore:rules|storage|set-iam-policy|add-iam-policy-binding/);
  assert.match(source,/assertCleanRepositoryEvidence/);
  assert.match(source,/verifyArtifactManifest/);
  assert.doesNotMatch(source,/--allow-unauthenticated/);
});

test("repository-integrity gate rejects dirty, staged, injected, and symlink evidence",()=>{
  assert.doesNotThrow(()=>assertCleanRepositoryEvidence({status:"",stagedDiff:"",untrackedOrIgnored:"",symlinkEntries:""}));
  for(const evidence of [
    {status:" M functions/src/index.ts"},{stagedDiff:"functions/src/index.ts"},
    {untrackedOrIgnored:"functions/src/injected.ts"},{symlinkEntries:"120000 abc 0\tfunctions/src/link.ts"},
  ]) assert.throws(()=>assertCleanRepositoryEvidence({status:"",stagedDiff:"",untrackedOrIgnored:"",symlinkEntries:"",...evidence}));
});

test("artifact manifest binds exact inputs and detects tampering",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"sandman-artifact-"));
  await mkdir(path.join(root,"lib"));
  await writeFile(path.join(root,"lib/index.js"),"exports.safe = true;\n");
  const artifactChecksum=await checksumDirectory(root);
  const expected={approvedCommit:commit,functionName:"getPracticeSession",projectId:"sandman-combat-staging"};
  await writeFile(path.join(root,"artifact-manifest.json"),JSON.stringify({...expected,artifactChecksum}));
  await assert.doesNotReject(verifyArtifactManifest(root,expected));
  await writeFile(path.join(root,"lib/index.js"),"exports.safe = false;\n");
  await assert.rejects(verifyArtifactManifest(root,expected),/checksum/);
});

test("artifact hashing rejects symbolic links",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"sandman-symlink-"));
  await writeFile(path.join(root,"outside"),"safe");
  await symlink(path.join(root,"outside"),path.join(root,"link"));
  await assert.rejects(checksumDirectory(root),/Symbolic links are forbidden/);
});

test("deploy mode requires exact function-bound no-invoker-check evidence",()=>{
  assert.throws(()=>assertTransportReadyForDeploy({},"getPracticeSession"),/transport remains unresolved/);
  assert.throws(()=>assertTransportReadyForDeploy({SANDMAN_CALLABLE_TRANSPORT_VERIFIED:"YES"},"getPracticeSession"),/transport remains unresolved/);
  assert.throws(()=>assertTransportReadyForDeploy({SANDMAN_CALLABLE_TRANSPORT_VERIFIED:"YES",
    SANDMAN_CALLABLE_TRANSPORT_EVIDENCE:callableTransportEvidence("skillCheckCoachCall")},"getPracticeSession"),/transport remains unresolved/);
  assert.doesNotThrow(()=>assertTransportReadyForDeploy({
    SANDMAN_CALLABLE_TRANSPORT_VERIFIED:"YES",
    SANDMAN_CALLABLE_TRANSPORT_EVIDENCE:callableTransportEvidence("getPracticeSession"),
  },"getPracticeSession"));
});

test("callable transport plan is one-service, staging-only, and nonmutating by default",()=>{
  const plan=transportPlan({functionName:"getPracticeSession",projectId:"sandman-combat-staging",
    projectNumber:"991554514268",confirmation:"TRANSPORT:getPracticeSession:sandman-combat-staging"});
  assert.equal(plan.apply,false);
  assert.equal(plan.service,"getpracticesession");
  assert.deepEqual(plan.command,["run","services","update","getpracticesession","--region=us-central1",
    "--project=sandman-combat-staging","--no-invoker-iam-check","--quiet"]);
  assert.doesNotMatch(plan.command.join(" "),/add-iam-policy-binding|allUsers|roles\/run.invoker/);
  assert.throws(()=>transportPlan({...plan,functionName:"hosting"}),/Exactly one approved/);
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

test("installed callable serializer does not claim unsupported invoker enforcement",async()=>{
  const serializer=await readFile(new URL("../../functions/node_modules/firebase-functions/lib/v2/providers/https.js",import.meta.url),"utf8");
  const onCall=serializer.slice(serializer.indexOf("function onCall"),serializer.indexOf("exports.onCall = onCall"));
  assert.match(onCall,/callableTrigger/);
  assert.doesNotMatch(onCall,/invoker/);
});
