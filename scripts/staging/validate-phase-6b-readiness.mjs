import {pathToFileURL} from "node:url";

export const PHASE_6B_PROJECT_ID="sandman-combat-staging";
export const PHASE_6B_PROJECT_NUMBER="991554514268";
export const PHASE_6B_BUCKET="sandman-combat-staging-firestore-backups";
export const PHASE_6B_SERVICE_AGENT="service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com";
export const FIRESTORE_READS_PER_PRICE_UNIT=100000;
export const FIRESTORE_READ_PRICE_USD=0.03;
export const US_STANDARD_STORAGE_GIB_MONTH_USD=0.026;

export function assessPhase6BReadiness({
  mode="validate",projectId,projectNumber,bucket,billingEnabled,billingAccountOpen,
  firebaseEnabled,storageBytes,documentCount=null,serviceAgent,serviceAgentRoleBound,
  sameProjectBucket=true,gcloudStorageReady=false,costCeilingUsd=1,
}={}){
  if(mode!=="validate") throw new Error("Phase 6B is read-only; provisioning and export are not implemented.");
  if(projectId!==PHASE_6B_PROJECT_ID||projectId==="sandmandashboard") throw new Error("Exact staging project ID is required.");
  if(projectNumber!==PHASE_6B_PROJECT_NUMBER) throw new Error("Exact staging project number is required.");
  if(bucket!==PHASE_6B_BUCKET) throw new Error("Exact accepted staging bucket name is required.");
  if(serviceAgent!==PHASE_6B_SERVICE_AGENT) throw new Error("Exact staging Firestore service agent is required.");
  if(!Number.isInteger(storageBytes)||storageBytes<0) throw new Error("Aggregate storage bytes must be a nonnegative integer.");
  if(documentCount!==null&&(!Number.isInteger(documentCount)||documentCount<0)) throw new Error("Document count must be null or a nonnegative integer.");
  if(!Number.isFinite(costCeilingUsd)||costCeilingUsd<1) throw new Error("The reviewed conservative ceiling is at least USD 1.");

  const storageGiB=storageBytes/(2**30);
  const storageUsdPerMonth=storageGiB*US_STANDARD_STORAGE_GIB_MONTH_USD;
  const exportReadUsd=documentCount===null?null:
    (documentCount/FIRESTORE_READS_PER_PRICE_UNIT)*FIRESTORE_READ_PRICE_USD;
  const blockers=[];
  if(!billingEnabled||!billingAccountOpen||!firebaseEnabled) blockers.push("billing-or-firebase-status");
  if(!serviceAgentRoleBound||!sameProjectBucket) blockers.push("service-agent-or-project-scope");
  if(documentCount===null) blockers.push("document-count-unavailable");
  if(!gcloudStorageReady) blockers.push("local-gcloud-storage-module");
  blockers.push("console-jobs-run-as-verification","soft-delete-policy-decision","separate-provisioning-approval");

  return Object.freeze({
    status:"CONDITIONAL",mode,projectId,projectNumber,bucket,serviceAgent,
    billingVerified:Boolean(billingEnabled&&billingAccountOpen&&firebaseEnabled),
    storageBytes,storageGiB,documentCount,exportReadUsd,storageUsdPerMonth,
    costCeilingUsd,additionalBucketIamExpected:!sameProjectBucket,blockers:Object.freeze(blockers),
  });
}

function parseArguments(argv){
  const result={mode:"validate"};
  for(const argument of argv){
    if(argument==="--validate") result.mode="validate";
    else if(["--execute","--provision","--export","--import"].includes(argument)) result.mode="execute";
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  return result;
}

export function main(argv=process.argv.slice(2),env=process.env){
  const input=parseArguments(argv);
  const result=assessPhase6BReadiness({...input,
    projectId:env.SANDMAN_STAGING_PROJECT_ID,
    projectNumber:env.SANDMAN_STAGING_PROJECT_NUMBER,
    bucket:env.SANDMAN_RECOVERY_BUCKET,
    billingEnabled:env.SANDMAN_BILLING_ENABLED==="true",
    billingAccountOpen:env.SANDMAN_BILLING_ACCOUNT_OPEN==="true",
    firebaseEnabled:env.SANDMAN_FIREBASE_ENABLED==="true",
    storageBytes:Number(env.SANDMAN_FIRESTORE_STORAGE_BYTES),
    documentCount:env.SANDMAN_FIRESTORE_DOCUMENT_COUNT?Number(env.SANDMAN_FIRESTORE_DOCUMENT_COUNT):null,
    serviceAgent:env.SANDMAN_FIRESTORE_SERVICE_AGENT,
    serviceAgentRoleBound:env.SANDMAN_FIRESTORE_SERVICE_AGENT_BOUND==="true",
    sameProjectBucket:env.SANDMAN_BUCKET_SAME_PROJECT==="true",
    gcloudStorageReady:env.SANDMAN_GCLOUD_STORAGE_READY==="true",
    costCeilingUsd:Number(env.SANDMAN_COST_CEILING_USD||1),
  });
  console.log(JSON.stringify(result,null,2));
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main();
