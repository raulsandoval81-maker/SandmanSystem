import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync('scripts/staging/emmett-2c-receipt-isolated-candidate.cjs','utf8');
const gates=JSON.parse(readFileSync('scripts/staging/emmett-2c-receipt-package-security-review.json','utf8'));
const review=JSON.parse(readFileSync('scripts/staging/emmett-2c-receipt-bootstrap-review.json','utf8'));
const callable=readFileSync('functions/src/billing/sendProposalPrepaidCashReceipt.ts','utf8');
const suite=readFileSync('functions/tests/prepaidCashReceipt.integration.cjs','utf8');
test('only one immutable 2C receipt function enters the candidate',()=>{
 assert.equal(gates.pinnedApplicationSha,review.applicationSha);
 assert.equal(gates.targetFunction,'sendProposalPrepaidCashReceipt');
 assert.deepEqual(gates.package.expectedExports,['sendProposalPrepaidCashReceipt']);
 assert.deepEqual(gates.package.expectedSourceFiles,[
  'src/index.ts','src/billing/sendProposalPrepaidCashReceipt.ts',
  'src/modules/email/resend.ts','src/proposals/proposalAccess.ts']);
 assert.match(script,/git.*rev-parse.*HEAD/);
 assert.match(script,/candidate output must be a new empty path/);
 assert.match(script,/unexpected source file\(s\)/);
 assert.match(script,/compiled unrelated functions or missing module/);
 assert.match(script,/if \(admin\.apps\.length === 0\) admin\.initializeApp\(\)/);
 assert.match(script,/export \{ sendProposalPrepaidCashReceipt \}/);
 assert.match(script,/deploymentAuthorized:false/);
});
test('release gates remain explicitly unverified and no production side effects permitted',()=>{
 for(const value of Object.values(gates.authorization))assert.equal(value,false);
 assert.equal(gates.security.runtimeSecretEffectiveAccess,'UNVERIFIED');
 assert.equal(gates.security.callableTransportAuth,'UNVERIFIED');
 assert.equal(gates.security.syntheticRecipientEnforcement,'UNVERIFIED');
 assert.equal(gates.rollback.targetBefore,'ABSENT in run 42388786652');
 assert.equal(gates.rollback.beforeDeployedRevision,'NOT_APPLICABLE_NEW_FUNCTION');
 assert.ok(gates.gatesToDeployment.length >= 5);
 assert.equal(review.guards.deploymentAuthorized,false);
 assert.doesNotMatch(script,/gcloud functions deploy|firebase deploy|secretmanager\.versions\.access|emails\.send|stripe\.charges/);
});
test('receipt source enforces management identity, payment authority and retry guards',()=>{
 for(const guard of ['if (!req.auth)','requireProposalStaffAccess','requireProposalLocationAccess',
  'cashPrepayment','stripeCheckoutSessionId','stripeSubscriptionId','SENDING','RESEND_API_KEY'])
  assert.ok(callable.includes(guard),guard);
 assert.match(suite,/FIRESTORE_EMULATOR_HOST/);
 assert.match(suite,/example\.test/);
 assert.match(suite,/STRIPE_SECRET_KEY \|\| process\.env\.RESEND_API_KEY/);
});
