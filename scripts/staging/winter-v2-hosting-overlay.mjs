#!/usr/bin/env node
// Preserve the entire live staging Hosting release and replace only three
// immutable Winter V2 assets. No local full-directory Firebase deploy.
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const SITE = 'sandman-combat-staging';
const BASE = 'https://firebasehosting.googleapis.com/v1beta1/sites/' + SITE;
const EXPECTED_REF = 'raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main';
const SHA = 'f801d51d6b6346b112548538977f9ec0e58146d1';
const FILES = [
  'public/connect/admissions/calculator/index.html',
  'public/connect/admissions/calculator/calculator.js',
  'public/promotions/winter-wrestling/winter-wrestling.js',
];
const action = process.argv[2];
const sourceRoot = process.argv[3];
if (!['preflight', 'deploy'].includes(action) || sourceRoot !== 'application') {
  throw Error('Expected preflight|deploy and exact application source root.');
}
if (process.env.GITHUB_REPOSITORY !== 'raulsandoval81-maker/SandmanSystem' ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.GITHUB_WORKFLOW_REF !== EXPECTED_REF ||
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.SANDMAN_STAGING_PROJECT_ID !== SITE ||
    process.env.SANDMAN_WINTER_V2_SOURCE_SHA !== SHA) {
  throw Error('Trusted main / project / immutable source boundary failed.');
}
if (action === 'deploy' && process.env.SANDMAN_WINTER_V2_HOSTING_APPROVAL !== 'APPROVE_WINTER_V2_STAGING_THREE_ASSETS') {
  throw Error('Staging Hosting deployment approval missing.');
}

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding:'utf8' }).trim();
if (!token) throw Error('Staging identity did not provide credentials.');
const api = async (url, { method='GET', body, raw }={}) => {
  if (!(url.startsWith(BASE + '/') || url === BASE ||
    url.startsWith('https://upload-firebasehosting.googleapis.com/upload/sites/' + SITE + '/'))) {
    throw Error('Unapproved Hosting API target.');
  }
  const headers = { Authorization: 'Bearer ' + token };
  if (body !== undefined) headers['Content-Type']='application/json';
  if (raw !== undefined) headers['Content-Type']='application/octet-stream';
  const res=await fetch(url,{method,headers,body:body===undefined?raw:JSON.stringify(body)});
  const value=await res.text();
  if (!res.ok) throw Error('Firebase Hosting API '+method+' request failed ('+res.status+').');
  try { return JSON.parse(value); } catch { return value; }
};
const getActive = async () => {
  const data=await api(BASE+'/releases?pageSize=1');
  const release=data.releases?.[0];
  const version=release?.version?.name;
  if (!/^sites\/sandman-combat-staging\/versions\/[A-Za-z0-9_-]+$/.test(version||'') ||
      !/^sites\/sandman-combat-staging\/releases\//.test(release.name||'')) {
    throw Error('Staging release or immutable version is missing.');
  }
  return {release:release.name,version};
};
const getFiles = async version => {
  const files=new Map();
  let pageToken='';
  for(let page=0;page<100;page++){
    const query=new URLSearchParams({pageSize:'1000'});
    if(pageToken)query.set('pageToken',pageToken);
    const result=await api('https://firebasehosting.googleapis.com/v1beta1/'+version+'/files?'+query);
    for(const f of result.files||[]){
      // Existing Hosting filenames may contain spaces, brackets, and Unicode.
      // Preserve safe URLs without rewriting their path names.
      const segments=typeof f.path==='string' ? f.path.split('/') : [];
      const pathValid=typeof f.path==='string' && f.path.startsWith('/') &&
        f.path.length<=2048 && !f.path.includes('\\') &&
        !/[\x00-\x1F\x7F]/.test(f.path) &&
        segments.slice(1).every(p=>p!=='' && p!=='.' && p!=='..');
      const hashValid=typeof f.hash==='string' && /^[a-fA-F0-9]{64}$/.test(f.hash);
      const active=f.status==='ACTIVE';
      const unique=!files.has(f.path);
      if(!pathValid || !hashValid || !active || !unique) {
        const reason=!pathValid?'unsafe-path':!hashValid?'invalid-hash':!active?'non-active-status':'duplicate-path';
        throw Error('Staging baseline manifest validation blocked: '+reason+' (page '+(page+1)+'). No Hosting changes made.');
      }
      files.set(f.path,f.hash);
    }
    pageToken=result.nextPageToken||'';
    if(!pageToken) return files;
  }
  throw Error('Staging manifest pagination exceeded safe limit.');
};
const replacements=new Map();
for(const file of FILES){
  const bytes=await readFile(path.join(sourceRoot,file));
  if(bytes.length===0)throw Error('Empty immutable source asset: '+file);
  const zipped=gzipSync(bytes,{mtime:0});
  const hash=createHash('sha256').update(zipped).digest('hex');
  replacements.set('/'+file.replace(/^public\//,''),{hash,zipped});
}
const active=await getActive();
const before=await getFiles(active.version);
const proposed=new Map(before);
for(const [file,{hash}] of replacements){
  if(!before.has(file))throw Error('Staging asset does not exist in live version: '+file);
  proposed.set(file,hash);
}
const changed=[...replacements].filter(([file,{hash}])=>before.get(file)!==hash).map(([file])=>file);
const untouched=[...before].every(([file,hash])=>replacements.has(file)||proposed.get(file)===hash);
if(!untouched || proposed.size!==before.size) throw Error('Unrelated Hosting files cannot change.');
console.log(JSON.stringify({action,site:SITE,sourceSha:SHA,baselineRelease:active.release,
  baselineVersion:active.version,filesInStaging:before.size,approvedPaths:FILES.map(x=>'/'+x.slice(7)),
  changedPaths:changed,unrelatedPathsPreserved:before.size-FILES.length}));
if(action==='preflight') process.exit(0);
if(changed.length===0) { console.log('All three assets already match. No release created.'); process.exit(0); }

const baseVersion=await api('https://firebasehosting.googleapis.com/v1beta1/'+active.version);
if(baseVersion.status!=='FINALIZED' || !baseVersion.config) throw Error('Live staging baseline config is unavailable.');
const version=await api(BASE+'/versions',{method:'POST',body:{config:baseVersion.config}});
if(!new RegExp('^sites/'+SITE+'/versions/[A-Za-z0-9_-]+$').test(version.name||'')) {
  throw Error('Could not create staging-only replacement version.');
}
const newName=version.name;
const required=new Set();
let uploadUrl='';
const entries=[...proposed.entries()];
for(let offset=0;offset<entries.length;offset+=900){
  const batch=Object.fromEntries(entries.slice(offset,offset+900));
  const result=await api('https://firebasehosting.googleapis.com/v1beta1/'+newName+':populateFiles',
    {method:'POST',body:{files:batch}});
  if(!result.uploadUrl || !result.uploadUrl.startsWith('https://upload-firebasehosting.googleapis.com/upload/sites/'+SITE+'/versions/')) {
    throw Error('Unexpected upload endpoint.');
  }
  uploadUrl=result.uploadUrl;
  for(const h of result.uploadRequiredHashes||[]) required.add(h);
}
const replacementByHash=new Map([...replacements.values()].map(v=>[v.hash,v.zipped]));
if([...required].some(h=>!replacementByHash.has(h))) {
  throw Error('Hosting would upload an unapproved asset; refusing release.');
}
for(const hash of required){
  await api(uploadUrl+'/'+hash,{method:'POST',raw:replacementByHash.get(hash)});
}
const staged=await getFiles(newName);
if(staged.size!==proposed.size || [...proposed].some(([p,h])=>staged.get(p)!==h)) {
  throw Error('Prepared Hosting version differs beyond approved three files.');
}
const finalized=await api('https://firebasehosting.googleapis.com/v1beta1/'+newName+'?update_mask=status',
  {method:'PATCH',body:{status:'FINALIZED'}});
if(finalized.status!=='FINALIZED') throw Error('Staging Hosting version was not finalized.');
const current=await getActive();
if(current.release!==active.release || current.version!==active.version) {
  throw Error('Staging Hosting changed during preparation. Do not release candidate.');
}
const release=await api(BASE+'/releases?versionName='+encodeURIComponent(newName),{method:'POST'});
if(release.version?.name!==newName || !/^sites\/sandman-combat-staging\/releases\//.test(release.name||'')) {
  throw Error('Staging Hosting release response could not be verified.');
}
const now=await getActive();
if(now.version!==newName) throw Error('New Hosting version is not active after release.');
console.log(JSON.stringify({result:'STAGING_HOSTING_OVERLAY_RELEASED',newRelease:now.release,newVersion:now.version,
  sourceSha:SHA,changedPaths:changed,untouchedFileCount:before.size-FILES.length}));
