import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {assessPhase6BReadiness} from "../../scripts/staging/validate-phase-6b-readiness.mjs";

const valid={mode:"validate",projectId:"sandman-combat-staging",projectNumber:"991554514268",
  bucket:"sandman-combat-staging-firestore-backups",billingEnabled:true,billingAccountOpen:true,
  firebaseEnabled:true,storageBytes:109569,documentCount:null,
  serviceAgent:"service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com",
  serviceAgentRoleBound:true,sameProjectBucket:true,gcloudStorageReady:false,costCeilingUsd:1};

test("Phase 6B assessment preserves unknown document count and reports conditional blockers",()=>{
  const result=assessPhase6BReadiness(valid);
  assert.equal(result.status,"CONDITIONAL");
  assert.equal(result.billingVerified,true);
  assert.equal(result.documentCount,null);
  assert.equal(result.exportReadUsd,null);
  assert.equal(result.additionalBucketIamExpected,false);
  assert.ok(result.storageUsdPerMonth<0.00001);
  assert.deepEqual(result.blockers,["document-count-unavailable","local-gcloud-storage-module",
    "console-jobs-run-as-verification","soft-delete-policy-decision","separate-provisioning-approval"]);
});

test("known aggregate document count produces a transparent read-cost estimate",()=>{
  const result=assessPhase6BReadiness({...valid,documentCount:100000});
  assert.equal(result.exportReadUsd,0.03);
});

test("production, identity drift, cloud execution, invalid metrics, and low ceiling fail closed",()=>{
  for(const override of [{projectId:"sandmandashboard"},{projectNumber:"889326401061"},
    {bucket:"other"},{serviceAgent:"991554514268-compute@developer.gserviceaccount.com"},
    {mode:"execute"},{storageBytes:-1},{documentCount:-1},{costCeilingUsd:0.99}]){
    assert.throws(()=>assessPhase6BReadiness({...valid,...override}));
  }
});

test("validator cannot execute cloud, IAM, data, progression, or AUTO changes",async()=>{
  const source=await readFile(new URL("../../scripts/staging/validate-phase-6b-readiness.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/spawn|execFile|add-iam-policy-binding|set-iam-policy|buckets create|firestore (?:export|import)/i);
  assert.doesNotMatch(source,/seed|awardXp|promotion|eligibleForAuto|lessonExecution|athlete/i);
  assert.match(source,/mode!=="validate"/);
});
