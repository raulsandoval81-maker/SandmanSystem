#!/usr/bin/env node
// Preserve the complete live staging release and replace only the reviewed 2C assets.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';

const SITE='sandman-combat-staging';
const BASE=`https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}`;
const EXPECTED_WORKFLOW='raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main';
export const FILES=Object.freeze([
  'public/connect/admissions/calculator/calculator.js',
  'public/connect/admissions/calculator/index.html',
  'public/connect/proposals/proposals.js',
  'public/intake-management/management.intake.js',
  'public/management/billing/billing.js',
  'public/management/enrollment-flow/enrollment-flow.js',
  'public/management/enrollment-flow/enrollment-stage.js',
]);
const [action,sourceRoot]=process.argv.slice(2);
const sourceSha=process.env.EMMETT_2C_FINAL_SHA||'';
const check=(ok,message)=>{if(!ok)throw Error(message)};
check(['preflight','deploy'].includes(action)&&sourceRoot==='application','Expected preflight|deploy application');
check(process.env.GITHUB_REPOSITORY==='raulsandoval81-maker/SandmanSystem'&&
  process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_WORKFLOW_REF===EXPECTED_WORKFLOW&&
  process.env.GITHUB_ACTIONS==='true'&&process.env.SANDMAN_STAGING_PROJECT_ID===SITE&&
  /^[0-9a-f]{40}$/.test(sourceSha),'Trusted staging exact-SHA boundary failed');
if(action==='deploy') check(process.env.EMMETT_2C_FINAL_APPROVAL===
  'APPROVE_2C_STAGING_INTAKE_AND_SEVEN_HOSTING_ASSETS','Explicit 2C deployment approval missing');

const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
check(token,'Staging identity did not provide credentials');
const api=async(url,{method='GET',body,raw}={})=>{
  check(url.startsWith(BASE+'/')||url.startsWith(`https://upload-firebasehosting.googleapis.com/upload/sites/${SITE}/`),
    'Unapproved Hosting API target');
  const headers={Authorization:`Bearer ${token}`};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(raw!==undefined)headers['Content-Type']='application/octet-stream';
  const response=await fetch(url,{method,headers,body:body===undefined?raw:JSON.stringify(body)});
  const text=await response.text();
  check(response.ok,`Firebase Hosting ${method} failed (${response.status})`);
  try{return JSON.parse(text)}catch{return text}
};
const activeRelease=async()=>{
  const data=await api(`${BASE}/releases?pageSize=1`); const release=data.releases?.[0];
  check(/^sites\/sandman-combat-staging\/releases\//.test(release?.name||'')&&
    /^sites\/sandman-combat-staging\/versions\/[A-Za-z0-9_-]+$/.test(release?.version?.name||''),'Active release missing');
  return {release:release.name,version:release.version.name};
};
const filesFor=async version=>{
  const files=new Map(); let pageToken='';
  for(let page=0;page<100;page++){
    const query=new URLSearchParams({pageSize:'1000'}); if(pageToken)query.set('pageToken',pageToken);
    const result=await api(`https://firebasehosting.googleapis.com/v1beta1/${version}/files?${query}`);
    for(const file of result.files||[]){
      const segments=typeof file.path==='string'?file.path.split('/'):[];
      const valid=typeof file.path==='string'&&file.path.startsWith('/')&&file.path.length<=2048&&
        !file.path.includes('\\')&&!/[\x00-\x1F\x7F]/.test(file.path)&&
        segments.slice(1).every(part=>part&&part!=='.'&&part!=='..')&&
        /^[a-fA-F0-9]{64}$/.test(file.hash||'')&&file.status==='ACTIVE'&&!files.has(file.path);
      check(valid,`Invalid live Hosting manifest entry on page ${page+1}`); files.set(file.path,file.hash);
    }
    pageToken=result.nextPageToken||''; if(!pageToken)return files;
  }
  throw Error('Hosting manifest pagination exceeded');
};
const replacements=new Map();
for(const file of FILES){
  const bytes=await readFile(path.join(sourceRoot,file)); check(bytes.length>0,`Empty source asset: ${file}`);
  const zipped=gzipSync(bytes,{mtime:0});
  replacements.set('/'+file.slice(7),{hash:createHash('sha256').update(zipped).digest('hex'),zipped});
}
const beforeRelease=await activeRelease(); const before=await filesFor(beforeRelease.version); const proposed=new Map(before);
for(const [file,{hash}] of replacements)proposed.set(file,hash);
const changed=[...replacements].filter(([file,{hash}])=>before.get(file)!==hash).map(([file])=>file);
check([...before].every(([file,hash])=>replacements.has(file)||proposed.get(file)===hash),'Unrelated Hosting file drift');
console.log(JSON.stringify({action,site:SITE,sourceSha,baselineRelease:beforeRelease.release,
  baselineVersion:beforeRelease.version,filesInStaging:before.size,approvedPaths:[...replacements.keys()],changedPaths:changed,
  missingPaths:[...replacements.keys()].filter(file=>!before.has(file)),unrelatedPathsPreserved:before.size-[...replacements.keys()].filter(file=>before.has(file)).length}));
if(action==='preflight'||changed.length===0)process.exit(0);
const baseline=await api(`https://firebasehosting.googleapis.com/v1beta1/${beforeRelease.version}`);
check(baseline.status==='FINALIZED'&&baseline.config,'Baseline config unavailable');
const created=await api(`${BASE}/versions`,{method:'POST',body:{config:baseline.config}});
check(/^sites\/sandman-combat-staging\/versions\/[A-Za-z0-9_-]+$/.test(created.name||''),'Candidate version invalid');
let uploadUrl=''; const required=new Set(); const entries=[...proposed];
for(let offset=0;offset<entries.length;offset+=900){
  const result=await api(`https://firebasehosting.googleapis.com/v1beta1/${created.name}:populateFiles`,
    {method:'POST',body:{files:Object.fromEntries(entries.slice(offset,offset+900))}});
  check(result.uploadUrl?.startsWith(`https://upload-firebasehosting.googleapis.com/upload/sites/${SITE}/versions/`),'Upload URL invalid');
  uploadUrl=result.uploadUrl; for(const hash of result.uploadRequiredHashes||[])required.add(hash);
}
const replacementByHash=new Map([...replacements.values()].map(value=>[value.hash,value.zipped]));
check([...required].every(hash=>replacementByHash.has(hash)),'Hosting requested an unapproved upload');
for(const hash of required)await api(`${uploadUrl}/${hash}`,{method:'POST',raw:replacementByHash.get(hash)});
const candidate=await filesFor(created.name);
check(candidate.size===proposed.size&&[...proposed].every(([file,hash])=>candidate.get(file)===hash),'Candidate changed unrelated files');
const finalized=await api(`https://firebasehosting.googleapis.com/v1beta1/${created.name}?update_mask=status`,
  {method:'PATCH',body:{status:'FINALIZED'}}); check(finalized.status==='FINALIZED','Candidate finalization failed');
const unchanged=await activeRelease(); check(unchanged.version===beforeRelease.version,'Hosting baseline changed during preparation');
const release=await api(`${BASE}/releases?versionName=${encodeURIComponent(created.name)}`,{method:'POST'});
check(release.version?.name===created.name,'Release verification failed');
const after=await activeRelease(); check(after.version===created.name,'New Hosting version not active');
console.log(JSON.stringify({result:'STAGING_2C_HOSTING_OVERLAY_RELEASED',sourceSha,newRelease:after.release,
  newVersion:after.version,changedPaths:changed,untouchedFileCount:before.size-[...replacements.keys()].filter(file=>before.has(file)).length}));
