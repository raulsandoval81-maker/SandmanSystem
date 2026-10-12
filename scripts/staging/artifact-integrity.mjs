import {createHash} from "node:crypto";
import {lstat, readFile, readdir} from "node:fs/promises";
import path from "node:path";

export const ARTIFACT_MANIFEST_NAME="artifact-manifest.json";

function digestEntries(entries){
  const hash=createHash("sha256");
  for(const {name,content} of [...entries].sort((a,b)=>a.name.localeCompare(b.name))){
    hash.update(name,"utf8");
    hash.update("\0");
    hash.update(String(content.byteLength),"utf8");
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function collectRegularFiles(root,{exclude=[]}={}){
  const excluded=new Set(exclude);
  const entries=[];
  async function visit(directory){
    const children=await readdir(directory,{withFileTypes:true});
    children.sort((a,b)=>a.name.localeCompare(b.name));
    for(const child of children){
      const absolute=path.join(directory,child.name);
      const relative=path.relative(root,absolute).split(path.sep).join("/");
      const stat=await lstat(absolute);
      if(stat.isSymbolicLink()) throw new Error(`Symbolic links are forbidden in the deployment artifact: ${relative}`);
      if(stat.isDirectory()) await visit(absolute);
      else if(stat.isFile()&&!excluded.has(relative)) entries.push({name:relative,content:await readFile(absolute)});
      else if(!stat.isFile()) throw new Error(`Non-regular deployment artifact entry is forbidden: ${relative}`);
    }
  }
  await visit(root);
  return entries;
}

export function checksumEntries(entries){
  return `sha256:${digestEntries(entries)}`;
}

export async function checksumDirectory(root,{exclude=[]}={}){
  return checksumEntries(await collectRegularFiles(root,{exclude}));
}

export function assertCleanRepositoryEvidence({status,stagedDiff,untrackedOrIgnored,symlinkEntries}){
  if(String(status||"").trim()) throw new Error("The Git worktree and index must be clean.");
  if(String(stagedDiff||"").trim()) throw new Error("Staged changes are forbidden.");
  if(String(untrackedOrIgnored||"").trim()) throw new Error("Untracked or ignored deployment source is forbidden.");
  if(String(symlinkEntries||"").trim()) throw new Error("Symbolic links are forbidden in deployment source.");
}

export async function verifyArtifactManifest(artifactRoot,expected){
  const manifestPath=path.join(artifactRoot,ARTIFACT_MANIFEST_NAME);
  const manifest=JSON.parse(await readFile(manifestPath,"utf8"));
  for(const [key,value] of Object.entries(expected)){
    if(manifest[key]!==value) throw new Error(`Artifact manifest ${key} does not match the approved plan.`);
  }
  const checksum=await checksumDirectory(artifactRoot,{exclude:[ARTIFACT_MANIFEST_NAME]});
  if(manifest.artifactChecksum!==checksum) throw new Error("Artifact checksum verification failed.");
  return manifest;
}
