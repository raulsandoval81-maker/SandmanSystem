import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>readFile(path.join(root,relative),'utf8');
const manifest=JSON.parse(await read('scripts/staging/pr561-waiver-release.json'));
const workflow=await read('.github/workflows/release-pr561-waiver-staging.yml');
const overlay=await read('scripts/staging/pr561-waiver-hosting-overlay.mjs');

test('PR561 release manifest is exact and staging only',()=>{
  assert.equal(manifest.sourceSha,'95e6a351226d18ac33e6220dc8c6a2d9fa6ba67c');
  assert.deepEqual(manifest.functions,['issueProposalClientReview','recordProposalPrepaidCash']);
  assert.deepEqual(manifest.hosting,['public/connect/admissions/calculator/payment-arrangement.js']);
  assert.equal(manifest.productionChanges,false);
  assert.equal(manifest.deploymentRequiresApproval,true);
  assert.equal(new Set(manifest.allowedSourceFiles).size,7);
});

test('workflow preserves exact SHA, approval, IAM, secrets and rollback checks',()=>{
  for(const text of ['refs/heads/main','sandman-combat-staging','95e6a351226d18ac33e6220dc8c6a2d9fa6ba67c',
    'APPROVE_PR561_STAGING_TWO_FUNCTIONS_ONE_HOSTING_ASSET','STAGING_TEST_EMAIL_ALLOWLIST','RESEND_API_KEY',
    'get-iam-policy','rollback','issueProposalClientReview','recordProposalPrepaidCash'])assert.match(workflow,new RegExp(text));
  assert.doesNotMatch(workflow,/emmett-2c-final-deploy/);
  assert.match(workflow,/environment: staging/);
});

test('Hosting overlay is exactly one file and protects seven existing 2C assets',()=>{
  assert.match(overlay,/export const FILE='public\/connect\/admissions\/calculator\/payment-arrangement\.js'/);
  const protectedPaths=overlay.match(/^\s+'\/(?:connect|intake-management|management)\/[^']+',$/gm)||[];
  assert.equal(protectedPaths.length,7);
  assert.match(overlay,/Candidate changed unrelated files/);
  assert.match(overlay,/Approved Hosting baseline changed/);
});
