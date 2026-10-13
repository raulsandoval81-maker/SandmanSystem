import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {assertCleanRepositoryEvidence, verifyArtifactManifest} from "./artifact-integrity.mjs";
import {prepareStagingFunctionArtifact, STAGING_FUNCTION_ARTIFACT_ROOT} from "./prepare-staging-function-artifact.mjs";
import {
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
  STAGING_PROJECT_NUMBER,
  STAGING_BUILD_SERVICE_ACCOUNTS,
  STAGING_DEPLOYER_SERVICE_ACCOUNTS,
  STAGING_RUNTIME_SERVICE_ACCOUNTS,
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
export const STAGING_FUNCTION_GROUPS=Object.freeze({
  getPracticeAttendanceReview:"attendance",updatePracticeCheckIn:"attendance",finalizePracticeAttendance:"attendance",
  createOrRecoverCanonicalPractice:"practice",openPracticeSession:"practice",getPracticeSession:"practice",closePracticeSession:"practice",
  savePracticeSessionMemory:"practice",savePracticeAthleteInput:"practice",saveDailyPracticeLog:"practice",
  completePracticeDailyGrind:"progression",skillCheckCoachCall:"progression",
});

export async function assertOneFunctionMigrationPlan({
  functionName,approvedCommit,currentCommit,projectId,projectNumber,runtimeServiceAccount,acknowledgement,
  confirmation,mode="validate",configPath=STAGING_MIGRATION_CONFIG,
}={}){
  if(!APPROVED_STAGING_FUNCTIONS.includes(functionName)){
    throw new Error("Exactly one approved staging function is required.");
  }
  if(projectId!==STAGING_PROJECT_ID||projectId===PRODUCTION_PROJECT_ID){
    throw new Error("The migration must target the exact approved staging project.");
  }
  if(projectNumber!==STAGING_PROJECT_NUMBER) throw new Error("The exact approved staging project number is required.");
  const functionGroup=STAGING_FUNCTION_GROUPS[functionName];
  const expectedRuntimeIdentity=STAGING_RUNTIME_SERVICE_ACCOUNTS[functionGroup];
  if(runtimeServiceAccount!==expectedRuntimeIdentity) throw new Error("The exact dedicated staging runtime service account is required.");
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
  return {mode,projectId,projectNumber,functionName,functionGroup,approvedCommit,
    expectedRuntimeIdentity,expectedBuildIdentity:STAGING_BUILD_SERVICE_ACCOUNTS[functionGroup],
    expectedDeployerIdentity:STAGING_DEPLOYER_SERVICE_ACCOUNTS[functionGroup],
    configPath,deployTarget:`functions:${functionName}`};
}

export function parseArguments(argv){
  const result={mode:"validate"};
  let functionCount=0;
  let commitCount=0;
  for(let index=0;index<argv.length;index+=1){
    const argument=argv[index];
    if(argument==="--deploy") result.mode="deploy";
    else if(argument==="--validate") result.mode="validate";
    else if(argument==="--function"){
      functionCount+=1;
      result.functionName=argv[++index];
    }else if(argument==="--commit"){
      commitCount+=1;
      result.approvedCommit=argv[++index];
    }
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  if(functionCount!==1) throw new Error("Exactly one --function argument is required.");
  if(commitCount!==1) throw new Error("Exactly one --commit argument is required.");
  return result;
}

function run(command,args,env=process.env){
  const result=spawnSync(command,args,{stdio:"inherit",env,shell:false});
  if(result.status!==0) throw new Error(`${command} failed with status ${result.status??"unknown"}.`);
}

function capture(command,args){
  const result=spawnSync(command,args,{encoding:"utf8",shell:false});
  if(result.status!==0) throw new Error(`${command} failed with status ${result.status??"unknown"}.`);
  return String(result.stdout||"");
}

export function assertTransportReadyForDeploy(env){
  if(env.SANDMAN_CALLABLE_TRANSPORT_VERIFIED!=="YES"||
      env.SANDMAN_CALLABLE_TRANSPORT_EVIDENCE!==`CALLABLE_TRANSPORT:${STAGING_PROJECT_ID}:${STAGING_PROJECT_NUMBER}`){
    throw new Error("Callable transport remains unresolved; deploy mode is blocked pending separately reviewed staging transport evidence.");
  }
}

export async function main(argv=process.argv.slice(2),env=process.env){
  const input=parseArguments(argv);
  const head=spawnSync("git",["rev-parse","HEAD"],{encoding:"utf8",shell:false});
  if(head.status!==0) throw new Error("Unable to resolve the current commit.");
  const plan=await assertOneFunctionMigrationPlan({...input,
    currentCommit:String(head.stdout||"").trim(),
    projectId:env.SANDMAN_STAGING_PROJECT_ID,
    projectNumber:env.SANDMAN_STAGING_PROJECT_NUMBER,
    runtimeServiceAccount:env.SANDMAN_SELECTED_RUNTIME_SERVICE_ACCOUNT,
    acknowledgement:env.SANDMAN_STAGING_ACK,
    confirmation:env.SANDMAN_STAGING_MIGRATION_CONFIRM,
  });
  assertCleanRepositoryEvidence({
    status:capture("git",["status","--porcelain=v1","--untracked-files=all"]),
    stagedDiff:capture("git",["diff","--cached","--name-only"]),
    untrackedOrIgnored:capture("git",["ls-files","--others","--ignored","--exclude-standard","--","functions/src","functions/package.json","functions/package-lock.json","functions/tsconfig.json"]),
    symlinkEntries:capture("git",["ls-files","-s","--","functions/src"]).split("\n").filter(line=>line.startsWith("120000 ")).join("\n"),
  });
  const manifest=await prepareStagingFunctionArtifact({approvedCommit:plan.approvedCommit,functionName:plan.functionName});
  await verifyArtifactManifest(STAGING_FUNCTION_ARTIFACT_ROOT,{
    approvedCommit:plan.approvedCommit,functionName:plan.functionName,projectId:STAGING_PROJECT_ID,
    projectNumber:STAGING_PROJECT_NUMBER,runtimeServiceAccount:plan.expectedRuntimeIdentity,
    deployTarget:plan.deployTarget,firebaseConfig:plan.configPath,
  });
  const validated={...plan,artifactManifest:manifest};
  console.log(JSON.stringify(validated,null,2));
  if(plan.mode==="validate") return validated;

  assertTransportReadyForDeploy(env);
  const boundary=await verifyStagingBoundary(env,plan.expectedRuntimeIdentity);
  if(boundary.projectId!==plan.projectId||boundary.runtimeServiceAccount!==plan.expectedRuntimeIdentity){
    throw new Error("Verified staging boundary does not match the approved migration plan.");
  }
  run("gcloud",["functions","deploy",plan.functionName,
    "--gen2","--region=us-central1",`--project=${STAGING_PROJECT_ID}`,
    "--runtime=nodejs22",`--entry-point=${plan.functionName}`,
    `--source=${STAGING_FUNCTION_ARTIFACT_ROOT}`,
    `--build-service-account=projects/${STAGING_PROJECT_ID}/serviceAccounts/${plan.expectedBuildIdentity}`,
    `--run-service-account=${plan.expectedRuntimeIdentity}`,
    "--trigger-http","--allow-unauthenticated","--serve-all-traffic-latest-revision",
    "--update-labels=deployment-callable=true,deployment-tool=change-c-controlled",
    `--set-env-vars=SANDMAN_STAGING_PROJECT_ID=${STAGING_PROJECT_ID},SANDMAN_STAGING_ACK=${STAGING_PROJECT_ID},SANDMAN_ATTENDANCE_RUNTIME_SERVICE_ACCOUNT=${STAGING_RUNTIME_SERVICE_ACCOUNTS.attendance},SANDMAN_PRACTICE_RUNTIME_SERVICE_ACCOUNT=${STAGING_RUNTIME_SERVICE_ACCOUNTS.practice},SANDMAN_PROGRESSION_RUNTIME_SERVICE_ACCOUNT=${STAGING_RUNTIME_SERVICE_ACCOUNTS.progression}`,
    "--quiet"],env);
  return validated;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await main();
}
