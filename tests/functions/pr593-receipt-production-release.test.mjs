import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),read=file=>readFile(path.join(root,file),'utf8');
const manifest=JSON.parse(await read('scripts/production/pr593-receipt-release.json'));
const workflow=await read('.github/workflows/release-pr593-receipt-production.yml');
const source=await read('functions/src/billing/sendProposalPrepaidCashReceipt.ts');
test('production manifest is immutable and exactly one function',()=>{
  assert.equal(manifest.project,'sandmandashboard');assert.equal(manifest.sourceSha,'ff4b6ca3997b89384f8287c838bce0718370172d');
  assert.equal(manifest.function,'sendProposalPrepaidCashReceipt');assert.equal(manifest.runtime,'nodejs22');
  assert.deepEqual(manifest.secretEnvironmentKeys,['RESEND_API_KEY']);assert.equal(manifest.localSourceClosure.length,3);
  assert.equal(manifest.hosting,false);assert.equal(manifest.firestoreWritesDuringRelease,false);
  assert.equal(manifest.stripeOperations,false);assert.equal(manifest.emailInvocations,false);
});
test('callable remains authenticated, paid-only, Stripe-excluding and fail-closed idempotent',()=>{
  for(const contract of ['if (!req.auth)','requireProposalStaffAccess','requireProposalLocationAccess','cashPrepayment',
    'stripeCheckoutSessionId','stripeSubscriptionId','current.status === "SENT"','current.status === "SENDING"',
    'status: "SENDING"','Provider response lacks an acceptance ID'])assert.ok(source.includes(contract),contract);
  assert.doesNotMatch(source,/stripe\.checkout\.sessions\.create|stripe\.paymentIntents\.create|stripe\.subscriptions\.create/);
});
test('workflow has a unique production approval and no data-plane or Hosting operations',()=>{
  for(const contract of ["environment: ${{ inputs.mode == 'preflight' && 'receipt-offline-preflight' || 'production' }}",'ff4b6ca3997b89384f8287c838bce0718370172d',
    'APPROVE_PR593_PRODUCTION_RECEIPT_ONE_FUNCTION','gcloud functions deploy "$FUNCTION_NAME"',
    '--no-allow-unauthenticated','--no-invoker-iam-check','RESEND_API_KEY=RESEND_API_KEY:latest'])assert.ok(workflow.includes(contract),contract);
  assert.doesNotMatch(workflow,/sandman-combat-staging|APPROVE_2C_STAGING|firebase deploy --only hosting|firestore (?:delete|set|update)|stripe/i);
  assert.match(workflow,/keys=Object\.keys\(candidate\)/);
  assert.match(workflow,/JSON\.stringify\(keys\).*sendProposalPrepaidCashReceipt/);
  assert.match(workflow,/ROLLBACK_REQUIRES_SEPARATE_DELETE_APPROVAL/);
  assert.equal((workflow.match(/sites\/sandman-main\/releases\?pageSize=1/g)||[]).length,2);
  assert.doesNotMatch(workflow,/sites\/sandmandashboard\/releases/);
  assert.match(workflow,/gcloud auth activate-service-account --key-file=/);
  assert.ok(workflow.includes('secretmanager.googleapis.com/v1/projects/${project}/secrets/RESEND_API_KEY:testIamPermissions'));
  assert.ok(workflow.includes('deployer-secret-permissions.json'));
  assert.ok(workflow.includes('cloudbuild.builds.create'));
  assert.ok(!workflow.includes("'cloudbuild.builds.create','secretmanager.secrets.get'"));
});
