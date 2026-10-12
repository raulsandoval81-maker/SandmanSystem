import {pathToFileURL} from "node:url";

export const RECOVERY_PROJECT_ID="sandman-combat-staging";
export const RECOVERY_PROJECT_NUMBER="991554514268";
export const RECOVERY_BUCKET="sandman-combat-staging-firestore-backups";
export const RECOVERY_BUCKET_LOCATION="US";
export const RECOVERY_DATABASE="(default)";
export const RECOVERY_SERVICE_AGENT="service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com";

export function assertRecoveryCheckpointPlan({
  mode="validate",projectId,projectNumber,bucket,database,location,acknowledgement,
  timestamp,retentionDays=30,lifecycleDeleteAgeDays=45,
}={}){
  if(mode!=="validate") throw new Error("Phase 6A supports validation only; cloud execution is not implemented.");
  if(projectId!==RECOVERY_PROJECT_ID||projectId==="sandmandashboard") throw new Error("Exact staging project ID is required.");
  if(projectNumber!==RECOVERY_PROJECT_NUMBER) throw new Error("Exact staging project number is required.");
  if(bucket!==RECOVERY_BUCKET) throw new Error("The exact approved recovery bucket is required.");
  if(database!==RECOVERY_DATABASE) throw new Error("The exact default staging database is required.");
  if(location!==RECOVERY_BUCKET_LOCATION) throw new Error("The reviewed US bucket location is required.");
  if(acknowledgement!==`VALIDATE_RECOVERY:${RECOVERY_PROJECT_ID}:${RECOVERY_PROJECT_NUMBER}`){
    throw new Error("Explicit recovery validation acknowledgement is required.");
  }
  if(!/^\d{8}T\d{6}Z$/.test(String(timestamp||""))) throw new Error("A unique UTC timestamp in YYYYMMDDTHHMMSSZ form is required.");
  if(retentionDays!==30||lifecycleDeleteAgeDays!==45) throw new Error("The reviewed draft retention and lifecycle values are required.");
  const destination=`gs://${RECOVERY_BUCKET}/runtime-migration/${timestamp}`;
  return Object.freeze({mode,projectId,projectNumber,bucket,database,location,
    serviceAgent:RECOVERY_SERVICE_AGENT,retentionDays,lifecycleDeleteAgeDays,destination,
    exportCommand:["gcloud","firestore","export",destination,`--database=${database}`,
      `--project=${projectId}`,"--async"]});
}

function parseArguments(argv){
  const result={mode:"validate"};
  for(let index=0;index<argv.length;index+=1){
    const argument=argv[index];
    if(argument==="--validate") result.mode="validate";
    else if(argument==="--execute"||argument==="--create"||argument==="--export") result.mode="execute";
    else if(argument==="--timestamp") result.timestamp=argv[++index];
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  return result;
}

export function main(argv=process.argv.slice(2),env=process.env){
  const input=parseArguments(argv);
  const plan=assertRecoveryCheckpointPlan({...input,
    projectId:env.SANDMAN_STAGING_PROJECT_ID,
    projectNumber:env.SANDMAN_STAGING_PROJECT_NUMBER,
    bucket:env.SANDMAN_RECOVERY_BUCKET,
    database:env.SANDMAN_RECOVERY_DATABASE,
    location:env.SANDMAN_RECOVERY_BUCKET_LOCATION,
    acknowledgement:env.SANDMAN_RECOVERY_ACK,
  });
  console.log(JSON.stringify(plan,null,2));
  return plan;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main();
