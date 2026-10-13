import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {APPROVED_STAGING_FUNCTIONS} from "./migrate-one-function.mjs";
import {STAGING_PROJECT_ID, STAGING_PROJECT_NUMBER} from "./verify-staging-boundary.mjs";

function run(args){
  return execFileSync("gcloud",args,{encoding:"utf8",maxBuffer:16*1024*1024});
}
function git(args){ return execFileSync("git",args,{encoding:"utf8"}); }
function json(args){ return JSON.parse(run(args)); }
function sha256(value){ return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function serviceName(functionName){ return functionName.toLowerCase(); }

export async function captureRollbackEvidence(outputPath){
  const activeAccount=run(["auth","list","--filter=status:ACTIVE","--format=value(account)"]).trim();
  const project=json(["projects","describe",STAGING_PROJECT_ID,"--format=json(projectId,projectNumber)"]);
  if(project.projectId!==STAGING_PROJECT_ID||String(project.projectNumber)!==STAGING_PROJECT_NUMBER){
    throw new Error("Exact staging project identity was not verified.");
  }
  const functions=[];
  for(const functionName of APPROVED_STAGING_FUNCTIONS){
    const description=json(["functions","describe",functionName,"--gen2","--region=us-central1",
      `--project=${STAGING_PROJECT_ID}`,"--format=json"]);
    const service=serviceName(functionName);
    const runService=json(["run","services","describe",service,"--region=us-central1",
      `--project=${STAGING_PROJECT_ID}`,"--format=json"]);
    const iam=json(["run","services","get-iam-policy",service,"--region=us-central1",
      `--project=${STAGING_PROJECT_ID}`,"--format=json"]);
    functions.push({functionName,service,state:description.state,updateTime:description.updateTime,
      runtime:description.buildConfig?.runtime,entryPoint:description.buildConfig?.entryPoint,
      buildServiceAccount:description.buildConfig?.serviceAccount,
      runtimeServiceAccount:description.serviceConfig?.serviceAccountEmail,
      source:description.buildConfig?.sourceProvenance?.resolvedStorageSource||description.buildConfig?.source?.storageSource,
      revision:description.serviceConfig?.revision,traffic:runService.status?.traffic||[],
      generation:runService.metadata?.generation,annotations:runService.metadata?.annotations||{},
      runIamPolicy:iam,environmentVariableNames:Object.keys(description.serviceConfig?.environmentVariables||{}).sort(),
      secretEnvironmentVariableNames:(description.serviceConfig?.secretEnvironmentVariables||[]).map((x)=>x.key).sort()});
  }
  const token=run(["auth","print-access-token"]).trim();
  const headers={Authorization:`Bearer ${token}`,"x-goog-user-project":STAGING_PROJECT_ID};
  const rulesRelease=await (await fetch(`https://firebaserules.googleapis.com/v1/projects/${STAGING_PROJECT_ID}/releases/cloud.firestore`,{headers})).json();
  if(!rulesRelease.rulesetName) throw new Error("Unable to resolve the live Firestore ruleset.");
  const ruleset=await (await fetch(`https://firebaserules.googleapis.com/v1/${rulesRelease.rulesetName}`,{headers})).json();
  const rulesFiles=(ruleset.source?.files||[]).map((file)=>({name:file.name,sha256:sha256(file.content||""),bytes:Buffer.byteLength(file.content||"")}));
  const hostingChannels=await (await fetch(`https://firebasehosting.googleapis.com/v1beta1/projects/-/sites/${STAGING_PROJECT_ID}/channels`,{headers})).json();
  const live=(hostingChannels.channels||[]).find((channel)=>channel.name?.endsWith("/channels/live"));
  if(!live?.release?.version?.name) throw new Error("Unable to resolve the live Hosting release.");
  const firestore=json(["firestore","databases","describe","--database=(default)",`--project=${STAGING_PROJECT_ID}`,"--format=json"]);
  const operations=json(["firestore","operations","list",`--project=${STAGING_PROJECT_ID}`,"--limit=50","--format=json"]);
  const exports=operations.filter((item)=>item.metadata?.["@type"]?.endsWith("ExportDocumentsMetadata"));
  const evidence={schemaVersion:1,capturedAt:new Date().toISOString(),captureMode:"read-only",
    activeAccount,project:{projectId:project.projectId,projectNumber:String(project.projectNumber)},
    functions,firestore:{database:{name:firestore.name,locationId:firestore.locationId,
      pointInTimeRecoveryEnablement:firestore.pointInTimeRecoveryEnablement,
      deleteProtectionState:firestore.deleteProtectionState,versionRetentionPeriod:firestore.versionRetentionPeriod},
      rules:{release:rulesRelease,ruleset:{name:ruleset.name,createTime:ruleset.createTime,files:rulesFiles}},exports},
    hosting:{site:STAGING_PROJECT_ID,liveChannel:{name:live.name,url:live.url,release:live.release}},
    repository:{head:git(["rev-parse","HEAD"]).trim(),pr83:"aa67f1f2222bfd5df81174d32391cb20557e78cd",
      firestoreRulesSha256:sha256(await readFile("firestore.rules"))},
    secretsIncluded:false,credentialsIncluded:false,firestoreDocumentsIncluded:false};
  await mkdir(path.dirname(outputPath),{recursive:true});
  await writeFile(outputPath,`${JSON.stringify(evidence,null,2)}\n`);
  return evidence;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const output=process.argv[2];
  if(!output) throw new Error("An output path is required.");
  const evidence=await captureRollbackEvidence(output);
  console.log(JSON.stringify({output,functions:evidence.functions.length,
    ruleset:evidence.firestore.rules.ruleset.name,hostingVersion:evidence.hosting.liveChannel.release.version.name,
    exports:evidence.firestore.exports.length},null,2));
}
