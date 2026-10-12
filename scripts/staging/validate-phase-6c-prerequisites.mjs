import {pathToFileURL} from "node:url";

export const PHASE_6C_POLICY=Object.freeze({
  projectId:"sandman-combat-staging",
  projectNumber:"991554514268",
  bucket:"sandman-combat-staging-firestore-backups",
  serviceAgent:"service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com",
  location:"US",
  storageClass:"STANDARD",
  uniformBucketLevelAccess:true,
  publicAccessPrevention:"enforced",
  versioning:true,
  retentionDays:30,
  retentionLocked:false,
  liveDeleteDays:45,
  noncurrentDeleteDays:30,
  softDeleteDays:7,
  costCeilingUsd:1,
  recurringExport:false,
});

export function validatePhase6CPrerequisites({mode="validate",policy={},gcloudStorageHelpWorks=false,
  consoleJobsRunAs=null,repairAuthorized=false,provisioningAuthorized=false}={}){
  if(mode!=="validate") throw new Error("Phase 6C is validation-only; repair, provisioning, export, and import execution are unavailable.");
  for(const [key,value] of Object.entries(PHASE_6C_POLICY)){
    if(policy[key]!==value) throw new Error(`Phase 6C policy mismatch: ${key}`);
  }
  if(policy.projectId==="sandmandashboard") throw new Error("Production is forbidden.");
  if(repairAuthorized) throw new Error("Repair authorization must be obtained and executed outside this validator.");
  if(provisioningAuthorized) throw new Error("Provisioning authorization has not been granted.");
  if(consoleJobsRunAs!==null&&consoleJobsRunAs!==PHASE_6C_POLICY.serviceAgent){
    throw new Error("Import/Export jobs-run-as identity mismatch.");
  }
  const blockers=[];
  if(!gcloudStorageHelpWorks) blockers.push("authorized-cli-repair-and-verification");
  if(consoleJobsRunAs===null) blockers.push("console-jobs-run-as-capture");
  blockers.push("separate-bucket-provisioning-authorization");
  return Object.freeze({status:"CONDITIONAL",mode,policy:PHASE_6C_POLICY,
    gcloudStorageHelpWorks,consoleJobsRunAs,blockers:Object.freeze(blockers)});
}

function parseArguments(argv){
  let mode="validate";
  for(const argument of argv){
    if(argument==="--validate") mode="validate";
    else if(["--repair","--execute","--provision","--export","--import"].includes(argument)) mode="execute";
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  return {mode};
}

export function main(argv=process.argv.slice(2),env=process.env){
  const {mode}=parseArguments(argv);
  const result=validatePhase6CPrerequisites({mode,policy:{...PHASE_6C_POLICY},
    gcloudStorageHelpWorks:env.SANDMAN_GCLOUD_STORAGE_HELP_WORKS==="true",
    consoleJobsRunAs:env.SANDMAN_IMPORT_EXPORT_JOBS_RUN_AS||null,
    repairAuthorized:env.SANDMAN_CLI_REPAIR_AUTHORIZED==="true",
    provisioningAuthorized:env.SANDMAN_BUCKET_PROVISIONING_AUTHORIZED==="true"});
  console.log(JSON.stringify(result,null,2));
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main();
