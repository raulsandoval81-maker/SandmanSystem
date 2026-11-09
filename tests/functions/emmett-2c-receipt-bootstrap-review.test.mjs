import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plan = JSON.parse(readFileSync('scripts/staging/emmett-2c-receipt-bootstrap-review.json','utf8'));
const existing = JSON.parse(readFileSync('scripts/staging/emmett-2c-readonly-preflight-plan.json','utf8'));
const source = readFileSync('functions/src/billing/sendProposalPrepaidCashReceipt.ts','utf8');
const entry = readFileSync('functions/src/index.ts','utf8');
const suite = readFileSync('functions/tests/prepaidCashReceipt.integration.cjs','utf8');
const trusted = readFileSync('.github/workflows/staging-exact-sha-release.yml','utf8');

test('receipt bootstrap is a non-executable, immutable staging-only review contract', () => {
 assert.equal(plan.projectId, 'sandman-combat-staging');
 assert.equal(plan.region, 'us-central1');
 assert.equal(plan.applicationSha, existing.applicationSha);
 assert.match(plan.applicationSha,/^[a-f0-9]{40}$/);
 assert.equal(plan.scope.action,'create-new-function-only');
 assert.deepEqual(plan.scope.functions,['sendProposalPrepaidCashReceipt']);
 assert.equal(plan.scope.generation,'GEN_2');
 assert.equal(plan.scope.runtime,'nodejs22');
 assert.equal(plan.scope.entryPoint,'sendProposalPrepaidCashReceipt');
 assert.deepEqual(plan.scope.hostingAssets,[]);
 assert.deepEqual(plan.scope.secretEnvironmentKeys,['RESEND_API_KEY']);
 assert.deepEqual(plan.scope.existingFunctionsToLeaveUntouched,
   ['recordProposalPrepaidCash','sendEnrollmentIntakeEmail','issueProposalEnrollmentHandoff','approveAndActivate']);
 for(const [key,value] of Object.entries(plan.guards)) {
   assert.equal(value,key==='stagingOnly'||key==='needsSeparateApprovedDeploymentWorkflow',key);
 }
 assert.ok(plan.requiredReadOnlyChecks.length>=8);
 assert.ok(plan.knownBlockers.length>=4);
 assert.ok(plan.validatedInventoryRunId>0&&plan.validatedInventoryArtifactId>0);
});
test('receipt function is exported and does not handle charges or intake activation', () => {
 assert.match(entry,/sendProposalPrepaidCashReceipt/);
 assert.match(source,/export const sendProposalPrepaidCashReceipt = onCall/);
 assert.match(source,/secrets: \[RESEND_API_KEY\]/);
 assert.match(source,/verifyStagingEmailRecipient\(recipient\)/);
 const emailGuard = readFileSync('functions/src/modules/email/resend.ts','utf8');
 assert.match(emailGuard,/if \(allowed.size === 0\) return \{ allowed: false/);
 const intake = readFileSync('functions/src/enrollment/sendEnrollmentIntakeEmail.ts','utf8');
 assert.match(intake,/secrets: \[RESEND_API_KEY, STAGING_TEST_EMAIL_ALLOWLIST\]/);
 assert.match(source,/getResendClient/);
 assert.match(source,/receiptRef/);
 assert.match(source,/stripeCheckoutSessionId/);
 assert.match(source,/stripeSubscriptionId/);
 assert.doesNotMatch(source,/stripe\.checkout\.sessions\.create|stripe\.subscriptions\.create/);
});
test('existing receipt tests refuse real credentials', () => {
 assert.match(suite,/FIRESTORE_EMULATOR_HOST/);
 assert.match(suite,/startsWith\("demo-"\)/);
 assert.match(suite,/STRIPE_SECRET_KEY \|\| process\.env\.RESEND_API_KEY/);
 assert.match(suite,/example\.test/);
});
test('review contract cannot be selected as an approved deployment entry', () => {
 assert.doesNotMatch(trusted,/emmett-2c-receipt-bootstrap-review-only/);
 assert.equal(plan.guards.deploymentAuthorized,false);
});
