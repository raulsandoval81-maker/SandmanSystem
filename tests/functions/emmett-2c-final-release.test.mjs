import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync('.github/workflows/staging-exact-sha-release.yml','utf8');
const overlay=readFileSync('scripts/staging/emmett-2c-final-hosting-overlay.mjs','utf8');

test('final 2C release excludes receipt deployment and targets only Intake plus seven assets',()=>{
  for(const action of ['emmett-2c-final-preflight','emmett-2c-final-deploy'])assert.ok(workflow.includes(action));
  const section=workflow.split('  emmett-2c-final-release:',2)[1];
  assert.ok(section);
  assert.match(section,/functions deploy sendEnrollmentIntakeEmail --no-gen2/);
  assert.doesNotMatch(section,/functions deploy sendProposalPrepaidCashReceipt/);
  assert.doesNotMatch(section,/set-iam-policy|add-iam-policy-binding|remove-iam-policy-binding/);
  assert.match(section,/APPROVE_2C_STAGING_INTAKE_AND_SEVEN_HOSTING_ASSETS/);
  assert.match(section,/joinsandmancombat@gmail\.com/);
  assert.match(section,/environment: staging/);
  assert.match(section,/ROLLBACK_EVIDENCE/);
  assert.match(section,/emmett-2c-intake-release\/package\.json.*delete p\.scripts\.build/);
  assert.equal((overlay.match(/'public\//g)||[]).length,7);
  assert.match(overlay,/Unrelated Hosting file drift/);
  assert.match(overlay,/Hosting baseline changed during preparation/);
});

test('receipt must be active with callable transport before final release',()=>{
  const section=workflow.split('  emmett-2c-final-release:',2)[1];
  assert.match(section,/sendProposalPrepaidCashReceipt/);
  assert.match(section,/state.*ACTIVE/);
  assert.match(section,/invoker-iam-disabled/);
  assert.match(section,/sendEnrollmentIntakeEmail/);
  assert.match(section,/STAGING_TEST_EMAIL_ALLOWLIST/);
});
