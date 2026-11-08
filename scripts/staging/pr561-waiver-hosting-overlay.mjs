#!/usr/bin/env node
// Preserve the live staging release and replace one reviewed PR #561 asset.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';

const SITE='sandman-combat-staging';
const SOURCE_SHA='95e6a351226d18ac33e6220dc8c6a2d9fa6ba67c';
const BASE=`https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}`;
const EXPECTED_WORKFLOW='raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main';
export const FILE='public/connect/admissions/calculator/payment-arrangement.js';
export const PROTECTED_2C_FILES=Object.freeze([
  '/connect/admissions/calculator/calculator.js',
  '/connect/admissions/calculator/index.html',
  '/connect/proposals/proposals.js',
  '/intake-management/management.intake.js',
  '/management/billing/billing.js',
  '/management/enrollment-flow/enrollment-flow.js',
  '/management/enrollment-flow/enrollment-stage.js',
]);

const [mode,sourceRoot,evidenceRoot]=process.argv.slice(2);
const check=(ok,message)=>{if(!ok)throw Error(message)};
check(['preflight','deploy'].includes(mode)&&sourceRoot&&evidenceRoot,'Expected preflight|deploy source-root evidence-root');
check(process.env.GITHUB_REPOSITORY==='raulsandoval81-maker/SandmanSystem'&&
  process.env.GITHUB_REF==='refs/heads/main'&&process.env.GITHUB_WORKFLOW_REF===EXPECTED_WORKFLOW&&
  process.env.GITHUB_ACTIONS==='true'&&process.env.SANDMAN_STAGING_PROJECT_ID===SITE&&
  process.env.PR561_SOURCE_SHA===SOURCE_SHA,'Trusted PR #561 staging boundary failed');
if(mode==='deploy')check(process.env.PR561_DEPLOY_APPROVAL===
  'APPROVE_PR561_STAGING_TWO_FUNCTIONS_ONE_HOSTING_ASSET','Explicit deployment approval missing');

const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8'}).trim();
check(token,'Staging identity did not provide credentials');
const api=async(url,{method='GET',body,raw}={})=>{
  check(url.startsWith(BASE+'/')||url.startsWith(`https://upload-firebasehosting.googleapis.com/upload/sites/${SITE}/`),
    'Unapproved Hosting API target');
  const headers={Authorization:`Bearer ${token}`};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(raw!==undefined)headers['Content-Type']='application/octet-stream';
  const response=await fetch(url,{method,headers,body:body===undefined?raw:JSON.stringify(body)});
  const text=await response.text(); check(response.ok,`Firebase Hosting ${method} failed (${response.status})`);
  try{return JSON.parse(text)}catch{return text}
};
const activeRelease=async()=>{
  const result=await api(`${BASE}/releases?pageSize=1`); const release=result.releases?.[0];
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
      check(typeof file.path==='string'&&file.path.startsWith('/')&&/^[a-fA-F0-9]{64}$/.test(file.hash||'')&&
        file.status==='ACTIVE'&&!files.has(file.path),'Invalid live Hosting manifest entry');
      files.set(file.path,file.hash);
    }
    pageToken=result.nextPageToken||''; if(!pageToken)return files;
  }
  throw Error('Hosting manifest pagination exceeded');
};

const beforeRelease=await activeRelease(); const before=await filesFor(beforeRelease.version);
for(const required of [...PROTECTED_2C_FILES,'/assets/js/runtime-environment.js','/staging-environment.json'])
  check(before.has(required),`Required staging asset missing: ${required}`);
const bytes=await readFile(path.join(sourceRoot,FILE)); check(bytes.length>1000,'Approved source asset is unexpectedly small');
const zipped=gzipSync(bytes,{mtime:0}); const hash=createHash('sha256').update(zipped).digest('hex');
const target='/'+FILE.slice(7); const proposed=new Map(before); proposed.set(target,hash);
const changed=before.get(target)===hash?[]:[target];
check([...before].every(([file,oldHash])=>file===target||proposed.get(file)===oldHash),'Unrelated Hosting file drift');
const report={mode,project:SITE,sourceSha:SOURCE_SHA,priorRelease:beforeRelease.release,
  priorVersion:beforeRelease.version,fileCount:before.size,approvedPath:target,changedPaths:changed,
  protected2cAssets:Object.fromEntries(PROTECTED_2C_FILES.map(file=>[file,before.get(file)])),
  rollback:{release:beforeRelease.release,version:beforeRelease.version}};
await mkdir(evidenceRoot,{recursive:true}); await writeFile(path.join(evidenceRoot,'hosting-before.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(mode==='preflight')process.exit(0);
check(changed.length===1,'Approved Hosting asset already matches or change scope is invalid');
check(process.env.PR561_EXPECTED_HOSTING_RELEASE===beforeRelease.release&&
  process.env.PR561_EXPECTED_HOSTING_VERSION===beforeRelease.version,'Approved Hosting baseline changed');
const baseline=await api(`https://firebasehosting.googleapis.com/v1beta1/${beforeRelease.version}`);
check(baseline.status==='FINALIZED'&&baseline.config,'Baseline config unavailable');
const created=await api(`${BASE}/versions`,{method:'POST',body:{config:baseline.config}});
const entries=[...proposed]; let uploadUrl=''; const required=new Set();
for(let offset=0;offset<entries.length;offset+=900){
  const result=await api(`https://firebasehosting.googleapis.com/v1beta1/${created.name}:populateFiles`,
    {method:'POST',body:{files:Object.fromEntries(entries.slice(offset,offset+900))}});
  uploadUrl=result.uploadUrl; for(const value of result.uploadRequiredHashes||[])required.add(value);
}
check([...required].every(value=>value===hash),'Hosting requested an unapproved upload');
if(required.has(hash))await api(`${uploadUrl}/${hash}`,{method:'POST',raw:zipped});
const candidate=await filesFor(created.name);
check(candidate.size===proposed.size&&[...proposed].every(([file,value])=>candidate.get(file)===value),'Candidate changed unrelated files');
await api(`https://firebasehosting.googleapis.com/v1beta1/${created.name}?update_mask=status`,
  {method:'PATCH',body:{status:'FINALIZED'}});
const unchanged=await activeRelease(); check(unchanged.version===beforeRelease.version,'Hosting baseline changed during preparation');
const release=await api(`${BASE}/releases?versionName=${encodeURIComponent(created.name)}`,{method:'POST'});
const after=await activeRelease(); check(after.version===created.name,'New Hosting version not active');
await writeFile(path.join(evidenceRoot,'hosting-after.json'),JSON.stringify({release:release.name,version:after.version,
  changedPaths:changed,rollback:report.rollback},null,2)+'\n');
