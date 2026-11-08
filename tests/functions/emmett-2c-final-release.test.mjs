import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/staging-exact-sha-release.yml',import.meta.url),'utf8');
const overlay=readFileSync(new URL('../../scripts/staging/emmett-2c-final-hosting-overlay.mjs',import.meta.url),'utf8');

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

test('boundary uses immutable dispatch SHA and reports early failures without a second artifact error',()=>{
  const section=workflow.split('  emmett-2c-final-release:',2)[1];
  assert.match(section,/EMMETT_2C_FINAL_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(section,/REQUESTED_EMMETT_2C_FINAL_SHA: \$\{\{ inputs\.emmett_2c_final_sha \}\}/);
  assert.match(section,/REQUESTED_SHA_MATCHES_DISPATCH/);
  assert.match(section,/2C release boundary failed: \$\{label\}/);
  assert.match(section,/mkdir -p evidence[\s\S]*FAILED_CONDITION=%s/);
  assert.match(section,/if-no-files-found: error/);
  assert.doesNotMatch(section,/^\s{6}EMMETT_2C_FINAL_SHA: \$\{\{ inputs\.emmett_2c_final_sha \}\}$/m);
});

test('release source manifest stays limited to the seven reviewed files',()=>{
  const section=workflow.split('  emmett-2c-final-release:',2)[1];
  const manifest=section.match(/printf '%s\\n' \\\n([\s\S]*?) \| sort > \/tmp\/2c-final-allowed/);
  assert.ok(manifest);
  const files=manifest[1].split('\\\n').map(line=>line.trim()).filter(Boolean);
  assert.deepEqual(files,[
    '.github/workflows/2c-staging-release-plan-validation.yml',
    '.github/workflows/staging-exact-sha-release.yml',
    'functions/tests/prepaidCashReceipt.integration.cjs',
    'scripts/staging/emmett-2c-final-hosting-overlay.mjs',
    'tests/functions/emmett-2c-final-blockers.test.mjs',
    'tests/functions/emmett-2c-final-release.test.mjs',
    'tests/functions/phase-c-management-location.test.mjs',
  ]);
});
