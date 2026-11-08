import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>readFile(path.join(root,relative),'utf8');
const manifest=JSON.parse(await read('scripts/staging/pr561-waiver-release.json'));
const workflow=await read('.github/workflows/staging-exact-sha-release.yml');
const overlay=await read('scripts/staging/pr561-waiver-hosting-overlay.mjs');
const verifyAfter=await read('scripts/staging/pr561-waiver-verify-after.mjs');
const wifEvidence=JSON.parse(await read('scripts/staging/pr561-wif-auth-evidence.json'));

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
  assert.match(workflow,/pr561-waiver-preflight/);
  assert.match(workflow,/pr561-waiver-deploy/);
  assert.match(workflow,/pr561-waiver-release:\n[\s\S]*environment: staging/);
  const job=workflow.split('\n  pr561-waiver-release:')[1];
  assert.ok(job);
  assert.doesNotMatch(job,/emmett-2c-final-deploy/);
  assert.match(job,/staging-exact-sha-release\.yml@refs\/heads\/main/);
  assert.match(job,/pr561-waiver-verify-after\.mjs/);
  assert.match(verifyAfter,/Target IAM changed/);
  assert.match(verifyAfter,/Neighbor changed/);
  assert.equal(wifEvidence.failedCondition,'assertion.workflow_ref');
  assert.equal(wifEvidence.failedRun,42443302886);
  assert.equal(wifEvidence.provenSuccessfulRun,42439681967);
  assert.equal(wifEvidence.iamChanged,false);
  assert.equal(wifEvidence.providerChanged,false);
  assert.match(wifEvidence.authorizedWorkflowRef,/staging-exact-sha-release\.yml@refs\/heads\/main$/);
});

test('Hosting overlay is exactly one file and protects seven existing 2C assets',()=>{
  assert.match(overlay,/export const FILE='public\/connect\/admissions\/calculator\/payment-arrangement\.js'/);
  const protectedPaths=overlay.match(/^\s+'\/(?:connect|intake-management|management)\/[^']+',$/gm)||[];
  assert.equal(protectedPaths.length,7);
  assert.match(overlay,/Candidate changed unrelated files/);
  assert.match(overlay,/Approved Hosting baseline changed/);
});
