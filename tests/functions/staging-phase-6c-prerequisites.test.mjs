import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {PHASE_6C_POLICY,validatePhase6CPrerequisites} from "../../scripts/staging/validate-phase-6c-prerequisites.mjs";

test("approved Phase 6C policy is exact and nonrecurring",()=>{
  assert.deepEqual(PHASE_6C_POLICY,{projectId:"sandman-combat-staging",projectNumber:"991554514268",
    bucket:"sandman-combat-staging-firestore-backups",
    serviceAgent:"service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com",
    location:"US",storageClass:"STANDARD",uniformBucketLevelAccess:true,
    publicAccessPrevention:"enforced",versioning:true,retentionDays:30,retentionLocked:false,
    liveDeleteDays:45,noncurrentDeleteDays:30,softDeleteDays:7,costCeilingUsd:1,recurringExport:false});
});

test("current pre-repair and pre-console state stops at three explicit boundaries",()=>{
  const result=validatePhase6CPrerequisites({policy:{...PHASE_6C_POLICY}});
  assert.equal(result.status,"CONDITIONAL");
  assert.deepEqual(result.blockers,["authorized-cli-repair-and-verification","console-jobs-run-as-capture",
    "separate-bucket-provisioning-authorization"]);
});

test("verified CLI and exact console identity still require provisioning authorization",()=>{
  const result=validatePhase6CPrerequisites({policy:{...PHASE_6C_POLICY},gcloudStorageHelpWorks:true,
    consoleJobsRunAs:PHASE_6C_POLICY.serviceAgent});
  assert.deepEqual(result.blockers,["separate-bucket-provisioning-authorization"]);
});

test("policy drift, production, wrong identity, and execution signals fail closed",()=>{
  for(const input of [{policy:{...PHASE_6C_POLICY,softDeleteDays:0}},
    {policy:{...PHASE_6C_POLICY,projectId:"sandmandashboard"}},
    {policy:{...PHASE_6C_POLICY},consoleJobsRunAs:"sandman-combat-staging@appspot.gserviceaccount.com"},
    {policy:{...PHASE_6C_POLICY},mode:"execute"},{policy:{...PHASE_6C_POLICY},repairAuthorized:true},
    {policy:{...PHASE_6C_POLICY},provisioningAuthorized:true}]) assert.throws(()=>validatePhase6CPrerequisites(input));
});

test("validator has no repair, cloud mutation, athlete data, progression, or AUTO capability",async()=>{
  const source=await readFile(new URL("../../scripts/staging/validate-phase-6c-prerequisites.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/spawn|execFile|brew (?:install|reinstall|upgrade)|components update|buckets create|firestore (?:export|import)|add-iam-policy-binding/i);
  assert.doesNotMatch(source,/seed|awardXp|promotion|eligibleForAuto|lessonExecution|athlete/i);
});
