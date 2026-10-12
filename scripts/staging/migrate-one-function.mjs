import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
  STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT,
  verifyStagingBoundary,
} from "./verify-staging-boundary.mjs";

export const APPROVED_STAGING_FUNCTIONS=Object.freeze([
  "closePracticeSession",
  "completePracticeDailyGrind",
  "createOrRecoverCanonicalPractice",
  "finalizePracticeAttendance",
  "getPracticeAttendanceReview",
  "getPracticeSession",
  "openPracticeSession",
  "saveDailyPracticeLog",
  "savePracticeAthleteInput",
  "savePracticeSessionMemory",
  "skillCheckCoachCall",
  "updatePracticeCheckIn",
]);

export const STAGING_MIGRATION_CONFIG="firebase.staging.json";

export async function assertOneFunctionMigrationPlan({
  functionName,approvedCommit,currentCommit,projectId,acknowledgement,
  confirmation,mode="validate",configPath=STAGING_MIGRATION_CONFIG,
}={}){
  if(!APPROVED_STAGING_FUNCTIONS.includes(functionName)){
    throw new Error("Exactly one approved staging function is required.");
  }
  if(projectId!==STAGING_PROJECT_ID||projectId===PRODUCTION_PROJECT_ID){
    throw new Error("The migration must target the exact approved staging project.");
  }
  if(acknowledgement!==STAGING_PROJECT_ID){
    throw new Error("The staging acknowledgement is missing or incorrect.");
  }
  if(confirmation!==`MIGRATE:${functionName}:${STAGING_PROJECT_ID}`){
    throw new Error("The one-function migration confirmation is missing or incorrect.");
  }
  if(!/^[0-9a-f]{40}$/i.test(String(approvedCommit||""))||approvedCommit!==currentCommit){
    throw new Error("The approved commit must be the exact current 40-character SHA.");
  }
  if(!["validate","deploy"].includes(mode)) throw new Error("Mode must be validate or deploy.");
  const config=JSON.parse(await readFile(configPath,"utf8"));
  if(config?.functions?.source!=="functions/.firebase-staging"||
      config?.hosting?.site!==STAGING_PROJECT_ID||
      config?.firestore?.rules!=="firestore.rules"){
    throw new Error("The reviewed staging Firebase configuration is required.");
  }
  return {mode,projectId,functionName,approvedCommit,
    expectedRuntimeIdentity:STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT,
    configPath,deployTarget:`functions:${functionName}`};
}

function parseArguments(argv){
  const result={mode:"validate"};
  for(let index=0;index<argv.length;index+=1){
    const argument=argv[index];
    if(argument==="--deploy") result.mode="deploy";
    else if(argument==="--validate") result.mode="validate";
    else if(argument==="--function") result.functionName=argv[++index];
    else if(argument==="--commit") result.approvedCommit=argv[++index];
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  return result;
}

function run(command,args,env=process.env){
  const result=spawnSync(command,args,{stdio:"inherit",env,shell:false});
  if(result.status!==0) throw new Error(`${command} failed with status ${result.status??"unknown"}.`);
}

export async function main(argv=process.argv.slice(2),env=process.env){
  const input=parseArguments(argv);
  const head=spawnSync("git",["rev-parse","HEAD"],{encoding:"utf8",shell:false});
  if(head.status!==0) throw new Error("Unable to resolve the current commit.");
  const plan=await assertOneFunctionMigrationPlan({...input,
    currentCommit:String(head.stdout||"").trim(),
    projectId:env.SANDMAN_STAGING_PROJECT_ID,
    acknowledgement:env.SANDMAN_STAGING_ACK,
    confirmation:env.SANDMAN_STAGING_MIGRATION_CONFIRM,
  });
  console.log(JSON.stringify(plan,null,2));
  if(plan.mode==="validate") return plan;

  const boundary=await verifyStagingBoundary(env);
  if(boundary.projectId!==plan.projectId||boundary.runtimeServiceAccount!==plan.expectedRuntimeIdentity){
    throw new Error("Verified staging boundary does not match the approved migration plan.");
  }
  run(process.execPath,["scripts/staging/prepare-staging-hosting.mjs"],env);
  run("npx",["--yes","firebase-tools@15.11.0","deploy",
    "--config",plan.configPath,"--project",STAGING_PROJECT_ID,
    "--only",plan.deployTarget,"--non-interactive"],env);
  return plan;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await main();
}
