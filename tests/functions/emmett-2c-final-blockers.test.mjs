import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/staging-exact-sha-release.yml',import.meta.url),'utf8');
const receipt=readFileSync(new URL('../../functions/src/billing/sendProposalPrepaidCashReceipt.ts',import.meta.url),'utf8');
const intake=readFileSync(new URL('../../functions/src/enrollment/sendEnrollmentIntakeEmail.ts',import.meta.url),'utf8');
const email=readFileSync(new URL('../../functions/src/modules/email/resend.ts',import.meta.url),'utf8');

test('both 2C email paths enforce the staging allowlist before provider access',()=>{
  for (const source of [receipt, intake]) {
    assert.match(source, /STAGING_TEST_EMAIL_ALLOWLIST/);
  }
  const receiptCheck = receipt.indexOf('verifyStagingEmailRecipient(recipient)');
  assert.ok(receiptCheck >= 0 && receiptCheck < receipt.indexOf('getResendClient()'));

  const resolve = intake.indexOf('const baseUrl = await resolveEnrollmentIntakeBaseUrl()');
  const intakeCheck = intake.match(/verifyStagingEmailRecipient\(\s*recipient,\s*baseUrl === `https:\/\/\$\{STAGING_PROJECT_ID\}\.web\.app` \? STAGING_PROJECT_ID : undefined\s*\)/);
  assert.ok(intakeCheck, 'Intake must pass the verified staging project to the recipient check');
  assert.ok(resolve >= 0 && resolve < intakeCheck.index);
  assert.ok(intakeCheck.index < intake.indexOf('getResendClient()'));
  assert.match(email, /verifyStagingEmailRecipient\(\s*recipient: string,\s*projectId = currentFirebaseProjectId\(\)/);
  assert.match(email, /projectId === STAGING_PROJECT \? STAGING_TEST_EMAIL_ALLOWLIST\.value\(\)/);
  assert.match(email,/projectId !== STAGING_PROJECT/);
  assert.match(email,/ALLOWLIST_NOT_CONFIGURED/);
  assert.match(email,/RECIPIENT_NOT_ALLOWED/);
  assert.doesNotMatch(email,/@gmail\.com|@sandmancombat\.com/);
});

test('receipt release is exact-SHA, explicit-approval and one-function only',()=>{
  assert.match(workflow,/emmett-2c-receipt-deploy/);
  assert.match(workflow,/APPROVE_2C_STAGING_RECEIPT_ONE_FUNCTION/);
  assert.match(workflow,/STAGING_TEST_EMAIL_ALLOWLIST_CONFIGURED/);
  const section=workflow.split('  emmett-2c-receipt-deploy:',2)[1]
    .split('\n  emmett-2c-final-release:',1)[0];
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
