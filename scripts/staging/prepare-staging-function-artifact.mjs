import {spawnSync} from "node:child_process";
import {cp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {ARTIFACT_MANIFEST_NAME, checksumDirectory, checksumEntries} from "./artifact-integrity.mjs";
import {STAGING_PROJECT_ID, STAGING_PROJECT_NUMBER, STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT} from "./verify-staging-boundary.mjs";

export const STAGING_FUNCTION_ARTIFACT_ROOT="functions/.firebase-staging";
const SOURCE_PATHS=["functions/src","functions/package.json","functions/package-lock.json","functions/tsconfig.json"];

function runCapture(command,args,{encoding="utf8"}={}){
  const result=spawnSync(command,args,{encoding,shell:false});
  if(result.status!==0) throw new Error(`${command} failed while preparing the staging artifact.`);
  return result.stdout;
}

export async function prepareStagingFunctionArtifact({approvedCommit,functionName,root=process.cwd()}={}){
  if(!/^[0-9a-f]{40}$/i.test(String(approvedCommit||""))) throw new Error("An exact approved commit is required.");
  if(!functionName) throw new Error("An approved function name is required.");
  const tracked=String(runCapture("git",["ls-files","--",...SOURCE_PATHS])).trim().split("\n").filter(Boolean).sort();
  if(!tracked.length) throw new Error("No tracked function source files were found.");
  const sourceEntries=[];
  for(const name of tracked) sourceEntries.push({name,content:await readFile(path.join(root,name))});
  const sourceChecksum=checksumEntries(sourceEntries);
  const output=path.join(root,STAGING_FUNCTION_ARTIFACT_ROOT);
  await rm(output,{recursive:true,force:true});
  await mkdir(output,{recursive:true});
  const build=spawnSync("npm",["exec","--prefix","functions","--","tsc","-p","functions/tsconfig.json","--outDir",STAGING_FUNCTION_ARTIFACT_ROOT+"/lib"],{
    cwd:root,env:process.env,stdio:"inherit",shell:false,
  });
  if(build.status!==0) throw new Error("Failed to compile the isolated staging Functions artifact.");
  await cp(path.join(root,"functions/package-lock.json"),path.join(output,"package-lock.json"));
  const packageJson=JSON.parse(await readFile(path.join(root,"functions/package.json"),"utf8"));
  packageJson.main="lib/staging.js";
  await writeFile(path.join(output,"package.json"),`${JSON.stringify(packageJson,null,2)}\n`,"utf8");
  await writeFile(path.join(output,`.env.${STAGING_PROJECT_ID}`),[
    `SANDMAN_STAGING_PROJECT_ID=${STAGING_PROJECT_ID}`,
    `SANDMAN_STAGING_ACK=${STAGING_PROJECT_ID}`,
    `SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT=${STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT}`,
    "",
  ].join("\n"),"utf8");
  const artifactChecksum=await checksumDirectory(output);
  const manifest={schemaVersion:1,approvedCommit,functionName,projectId:STAGING_PROJECT_ID,
    projectNumber:STAGING_PROJECT_NUMBER,runtimeServiceAccount:STAGING_WRESTLING_RUNTIME_SERVICE_ACCOUNT,
    firebaseConfig:"firebase.staging.json",deployTarget:`functions:${functionName}`,
    sourceChecksum,artifactChecksum};
  await writeFile(path.join(output,ARTIFACT_MANIFEST_NAME),`${JSON.stringify(manifest,null,2)}\n`,"utf8");
  return manifest;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const approvedCommit=process.env.SANDMAN_APPROVED_COMMIT;
  const functionName=process.env.SANDMAN_SELECTED_FUNCTION;
  console.log(JSON.stringify(await prepareStagingFunctionArtifact({approvedCommit,functionName}),null,2));
}
