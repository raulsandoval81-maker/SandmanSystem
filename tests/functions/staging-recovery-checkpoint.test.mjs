import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {assertRecoveryCheckpointPlan} from "../../scripts/staging/validate-recovery-checkpoint-plan.mjs";

const valid={mode:"validate",projectId:"sandman-combat-staging",projectNumber:"991554514268",
  bucket:"sandman-combat-staging-firestore-backups",database:"(default)",location:"US",
  acknowledgement:"VALIDATE_RECOVERY:sandman-combat-staging:991554514268",
  timestamp:"20261012T160000Z",retentionDays:30,lifecycleDeleteAgeDays:45};

test("recovery plan is staging-only, fixed-destination, and validation-only",()=>{
  const plan=assertRecoveryCheckpointPlan(valid);
  assert.equal(plan.destination,"gs://sandman-combat-staging-firestore-backups/runtime-migration/20261012T160000Z");
  assert.deepEqual(plan.exportCommand,["gcloud","firestore","export",plan.destination,
    "--database=(default)","--project=sandman-combat-staging","--async"]);
});

test("production, wrong number, unknown bucket, redirects, and missing acknowledgement fail closed",()=>{
  for(const override of [
    {projectId:"sandmandashboard"},{projectNumber:"889326401061"},{bucket:"unknown-bucket"},
    {bucket:"sandman-combat-staging-firestore-backups/../../other"},{database:"other"},
    {location:"us-central1"},{acknowledgement:""},{timestamp:"latest"},{mode:"execute"},
  ]) assert.throws(()=>assertRecoveryCheckpointPlan({...valid,...override}));
});

test("validator contains no cloud mutation, IAM broadening, import, restore, seed, XP, promotion, or AUTO operation",async()=>{
  const source=await readFile(new URL("../../scripts/staging/validate-recovery-checkpoint-plan.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/spawn|execFile|add-iam-policy-binding|set-iam-policy|buckets create|firestore import|\brestore\b/i);
  assert.doesNotMatch(source,/seed|awardXp|promotion|eligibleForAuto|lessonExecution/i);
  assert.match(source,/mode!=="validate"/);
});
