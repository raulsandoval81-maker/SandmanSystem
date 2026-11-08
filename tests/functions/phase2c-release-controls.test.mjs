import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const root=process.cwd();
test('Hosting refuses untrusted workflow before requesting credentials',()=>{
 const cwd=mkdtempSync(tmpdir()+'/phase2c-guard-');
 const r=spawnSync(process.execPath,[resolve(root,'scripts/staging/phase2c-hosting.mjs'),'deploy','application','evidence'],{cwd,env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/Trusted Phase 2C staging boundary failed/);
 assert.doesNotMatch(r.stderr,/gcloud/);assert.equal(existsSync(cwd+'/evidence'),false);
});
test('Functions refuse untrusted workflow before contacting GCP',()=>{
 const cwd=mkdtempSync(tmpdir()+'/phase2c-guard-');
 const r=spawnSync('python',[resolve(root,'scripts/staging/phase2c-functions.py'),'deploy'],{cwd,env:{PATH:process.env.PATH},encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/AssertionError/);assert.doesNotMatch(r.stderr,/Read failed|Deploy failed/);
});
test('Pinned release has exactly two functions and two Hosting paths with no production deployment job',()=>{
 const h=readFileSync('scripts/staging/phase2c-hosting.mjs','utf8');
 assert.match(h,/86bde3e2c57cf8239f3660f5723e1a4864f0e7b3/);
 assert.match(h,/FILES=Object.freeze\(\['public\/intake-management\/management.intake.js','public\/management\/billing\/billing.js'\]\)/);
 const p=readFileSync('scripts/staging/phase2c-functions.py','utf8');
 assert.match(p,/TARGETS=\['sendEnrollmentIntakeEmail','recordManualEnrollmentIntakeDelivery'\]/);
 assert.match(p,/EXPECTED_FUNCTION_BASELINE/);assert.match(p,/configuration changed/);assert.match(p,/IAM changed/);
 const w=readFileSync('.github/workflows/staging-exact-sha-release.yml','utf8');
 const job=w.slice(w.indexOf('  phase2c-approved-final:'));
 assert.match(job,/phase2c-final-preflight/);assert.match(job,/phase2c-final-deploy/);
 assert.doesNotMatch(job,/sandmandashboard|sandman-main/);
 assert.match(job,/phase2c_function_baseline/);
});
