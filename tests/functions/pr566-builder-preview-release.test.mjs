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
