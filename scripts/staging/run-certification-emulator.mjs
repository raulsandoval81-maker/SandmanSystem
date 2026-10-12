import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function assertEmulatorCertificationEnvironment(env=process.env){
  const projectId=String(env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT||"demo-sandman-historical").trim();
  if(!projectId.startsWith("demo-")||projectId==="sandmandashboard"||projectId==="sandman-combat-staging"){
    throw new Error("Certification runner is emulator-only and requires a demo-* project.");
  }
  return projectId;
}

export function certificationCommands(projectId){
  return [
    ["firebase","emulators:exec","--only","firestore","--project",projectId,
      "npm --prefix functions run test:integration"],
    ["firebase","emulators:exec","--only","firestore","--project",projectId,
      "node functions/tests/historicalAuthority.rules.cjs"],
  ];
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const projectId=assertEmulatorCertificationEnvironment();
  for(const [command,...args] of certificationCommands(projectId)){
    const result=spawnSync(command,args,{cwd:process.cwd(),env:{...process.env,GCLOUD_PROJECT:projectId},
      stdio:"inherit",shell:false});
    if(result.status!==0)process.exit(result.status??1);
  }
}
