import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync('.github/workflows/staging-exact-sha-release.yml','utf8');
const receipt=readFileSync('functions/src/billing/sendProposalPrepaidCashReceipt.ts','utf8');
const intake=readFileSync('functions/src/enrollment/sendEnrollmentIntakeEmail.ts','utf8');
const email=readFileSync('functions/src/modules/email/resend.ts','utf8');

test('both 2C email paths enforce the staging allowlist before provider access',()=>{
  for(const source of [receipt,intake]) {
    assert.match(source,/STAGING_TEST_EMAIL_ALLOWLIST/);
    assert.match(source,/verifyStagingEmailRecipient\(recipient\)/);
    assert.ok(source.indexOf('verifyStagingEmailRecipient(recipient)') < source.indexOf('getResendClient()'));
  }
  assert.match(email,/projectId !== STAGING_PROJECT/);
  assert.match(email,/ALLOWLIST_NOT_CONFIGURED/);
  assert.match(email,/RECIPIENT_NOT_ALLOWED/);
  assert.doesNotMatch(email,/@gmail\.com|@sandmancombat\.com/);
});

test('receipt release is exact-SHA, explicit-approval and one-function only',()=>{
  assert.match(workflow,/emmett-2c-receipt-deploy/);
  assert.match(workflow,/APPROVE_2C_STAGING_RECEIPT_ONE_FUNCTION/);
  assert.match(workflow,/STAGING_TEST_EMAIL_ALLOWLIST_CONFIGURED/);
  const section=workflow.split('  emmett-2c-receipt-deploy:',2)[1];
  assert.match(section,/gcloud functions deploy sendProposalPrepaidCashReceipt --gen2/);
  assert.doesNotMatch(section,/gcloud functions deploy (?!sendProposalPrepaidCashReceipt)/);
  for(const neighbor of ['recordProposalPrepaidCash','sendEnrollmentIntakeEmail','issueProposalEnrollmentHandoff','approveAndActivate']) {
    assert.doesNotMatch(section,new RegExp('functions deploy '+neighbor));
  }
  assert.match(section,/STAGING_TEST_EMAIL_ALLOWLIST=STAGING_TEST_EMAIL_ALLOWLIST:latest/);
  assert.match(section,/RESEND_API_KEY=RESEND_API_KEY:latest/);
  assert.match(section,/TARGET_ALREADY_EXISTS_STOP/);
  assert.match(section,/ROLLBACK_REQUIRES_SEPARATE_DELETE_APPROVAL/);
});
