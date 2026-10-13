import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {APPROVED_STAGING_FUNCTIONS, callableTransportEvidence} from "./migrate-one-function.mjs";
import {STAGING_PROJECT_ID, STAGING_PROJECT_NUMBER} from "./verify-staging-boundary.mjs";

const SERVICES=Object.freeze(Object.fromEntries(
  APPROVED_STAGING_FUNCTIONS.map((name)=>[name,name.toLowerCase()])
));

export function transportPlan({functionName,projectId,projectNumber,confirmation,apply=false}={}){
  if(!APPROVED_STAGING_FUNCTIONS.includes(functionName)) throw new Error("Exactly one approved callable is required.");
  if(projectId!==STAGING_PROJECT_ID||projectNumber!==STAGING_PROJECT_NUMBER) throw new Error("Exact staging project identity is required.");
  if(confirmation!==`TRANSPORT:${functionName}:${STAGING_PROJECT_ID}`) throw new Error("Exact per-service transport confirmation is required.");
  const service=SERVICES[functionName];
  return Object.freeze({apply,functionName,service,projectId,projectNumber,
    evidence:callableTransportEvidence(functionName),
    command:["run","services","update",service,"--region=us-central1",`--project=${STAGING_PROJECT_ID}`,"--no-invoker-iam-check","--quiet"]});
}

function run(args){
  const result=spawnSync("gcloud",args,{stdio:"inherit",shell:false});
  if(result.status!==0) throw new Error(`gcloud failed with status ${result.status??"unknown"}.`);
}

export function parseArguments(argv){
  const result={apply:false};
  for(let i=0;i<argv.length;i+=1){
    if(argv[i]==="--apply") result.apply=true;
    else if(argv[i]==="--validate") result.apply=false;
    else if(argv[i]==="--function") result.functionName=argv[++i];
    else throw new Error(`Unsupported argument: ${argv[i]}`);
  }
  return result;
}

export function main(argv=process.argv.slice(2),env=process.env){
  const args=parseArguments(argv);
  const plan=transportPlan({...args,projectId:env.SANDMAN_STAGING_PROJECT_ID,
    projectNumber:env.SANDMAN_STAGING_PROJECT_NUMBER,
    confirmation:env.SANDMAN_STAGING_TRANSPORT_CONFIRM});
  console.log(JSON.stringify(plan,null,2));
  if(plan.apply) run(plan.command);
  return plan;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main();
