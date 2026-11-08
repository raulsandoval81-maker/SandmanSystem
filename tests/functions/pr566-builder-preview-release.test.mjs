import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),read=file=>readFile(path.join(root,file),'utf8');
const workflow=await read('.github/workflows/staging-exact-sha-release.yml');
const overlay=await read('scripts/staging/pr566-builder-preview-hosting-overlay.mjs');
const manifest=JSON.parse(await read('scripts/staging/pr566-builder-preview-release.json'));
test('PR566 manifest pins exactly four reviewed files and one Hosting asset',()=>{
  assert.equal(manifest.sourceSha,'4a1f3c0b4bfb6172a3b660a693d5a51156b9eb0b');
  assert.equal(manifest.allowedSourceFiles.length,4);assert.deepEqual(manifest.functions,[]);
  assert.deepEqual(manifest.hosting,['public/connect/admissions/calculator/calculator.js']);
});
test('PR566 action stays distinct, exact-SHA, staging protected and approval gated',()=>{
  const job=workflow.split('\n  pr566-builder-preview-release:')[1];assert.ok(job);
  for(const value of ['pr566-builder-preview-preflight','pr566-builder-preview-deploy','environment: staging',
    '4a1f3c0b4bfb6172a3b660a693d5a51156b9eb0b','APPROVE_PR566_STAGING_ONE_BUILDER_ASSET',
    'npm --prefix application/functions run test:payment-arrangements','pr566-builder-preview-hosting-overlay.mjs',
    "grep -q '# tests 59'", "grep -q '# pass 59'", "grep -q '# fail 0'"])assert.ok(job.includes(value),value);
  assert.doesNotMatch(job,/emmett-2c-final|winter-|pr561-waiver-hosting-overlay|gcloud functions deploy|firestore|stripe/i);
});
test('overlay changes one file and preserves six other protected 2C assets plus the full manifest',()=>{
  assert.match(overlay,/export const FILE='public\/connect\/admissions\/calculator\/calculator\.js'/);
  assert.equal((overlay.match(/^\s+'\/(?:connect|intake-management|management)\/[^']+',$/gm)||[]).length,7);
  assert.match(overlay,/Candidate changed unrelated files/);assert.match(overlay,/Protected 2C asset changed/);
  assert.match(overlay,/rollback:\{release:beforeRelease\.release,version:beforeRelease\.version\}/);
});


test('preflight executes offline and writes all seven protected hashes without cloud writes',async()=>{
  const {mkdtemp,writeFile,mkdir,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {spawnSync}=await import('node:child_process');
  const dir=await mkdtemp(path.join(tmpdir(),'pr566-preflight-'));
  try {
    const source=path.join(dir,'application'), evidence=path.join(dir,'evidence');
    await mkdir(path.join(source,'public/connect/admissions/calculator'),{recursive:true});
    await writeFile(path.join(source,'public/connect/admissions/calculator/calculator.js'),'/* synthetic builder */'.repeat(100));
    const paths=['/connect/admissions/calculator/calculator.js','/connect/admissions/calculator/index.html',
      '/connect/proposals/proposals.js','/intake-management/management.intake.js','/management/billing/billing.js',
      '/management/enrollment-flow/enrollment-flow.js','/management/enrollment-flow/enrollment-stage.js',
      '/assets/js/runtime-environment.js','/staging-environment.json','/unrelated.txt'];
    const files=paths.map((path,index)=>({path,hash:index.toString(16).padStart(64,'0'),status:'ACTIVE'}));
    const release='sites/sandman-combat-staging/releases/synthetic';
    const version='sites/sandman-combat-staging/versions/synthetic';
    const loader=path.join(dir,'mock.mjs');
    await writeFile(loader,`
      import childProcess from 'node:child_process';
      import {syncBuiltinESMExports} from 'node:module';
      childProcess.execFileSync=(command,args)=>{
        if(command!=='gcloud'||JSON.stringify(args)!==JSON.stringify(['auth','print-access-token']))throw Error('Unexpected command');
        return 'synthetic-token';
      };
      syncBuiltinESMExports();
      const calls=[];
      globalThis.fetch=async(url,options)=>{
        if(options.method!=='GET')throw Error('Cloud write forbidden');
        calls.push(url);
        let data;
        if(url==='https://firebasehosting.googleapis.com/v1beta1/sites/sandman-combat-staging/releases?pageSize=1')data={releases:[{name:${JSON.stringify(release)},version:{name:${JSON.stringify(version)}}}]};
        else if(url==='https://firebasehosting.googleapis.com/v1beta1/${version}/files?pageSize=1000')data={files:${JSON.stringify(files)}};
        else throw Error('Unexpected API request: '+url);
        return {ok:true,text:async()=>JSON.stringify(data)};
      };
      process.on('exit',()=>{if(calls.length!==2)throw Error('Expected exactly two read-only requests')});
    `);
    const result=spawnSync(process.execPath,['--import',loader,path.join(root,'scripts/staging/pr566-builder-preview-hosting-overlay.mjs'),'preflight',source,evidence],{
      encoding:'utf8',env:{...process.env,GITHUB_REPOSITORY:'raulsandoval81-maker/SandmanSystem',GITHUB_REF:'refs/heads/main',
      GITHUB_WORKFLOW_REF:'raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main',
      GITHUB_ACTIONS:'true',SANDMAN_STAGING_PROJECT_ID:'sandman-combat-staging',PR566_SOURCE_SHA:manifest.sourceSha}});
    assert.equal(result.status,0,result.stderr);
    const report=JSON.parse(await readFile(path.join(evidence,'hosting-before.json'),'utf8'));
    assert.deepEqual(report.protected2cBefore,Object.fromEntries(files.slice(0,7).map(file=>[file.path,file.hash])));
    assert.equal(report.fileCount,10);
    assert.deepEqual(report.changedPaths,[paths[0]]);
    assert.equal(report.priorRelease,release);assert.equal(report.priorVersion,version);
    assert.equal(report.protected2cUnchanged.length,6);
  } finally {await rm(dir,{recursive:true,force:true});}
});
