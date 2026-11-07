import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/staging-exact-sha-release.yml','utf8');
const script=readFileSync('scripts/staging/emmett-2c-receipt-readonly-preflight.py','utf8');
const review=JSON.parse(readFileSync('scripts/staging/emmett-2c-receipt-bootstrap-review.json','utf8'));
const action='emmett-2c-receipt-readonly-preflight';
const index=workflow.indexOf('  '+action+':\n');
const job=workflow.slice(index);
test('only protected staging main can dispatch review-only receipt checks',()=>{
 assert.ok(index>0);
 assert.match(workflow,/          - emmett-2c-receipt-readonly-preflight/);
 assert.match(job,/inputs\.action == 'emmett-2c-receipt-readonly-preflight'/);
 assert.match(job,/environment: staging/);
 assert.match(job,/GITHUB_WORKFLOW_REF.*staging-exact-sha-release\.yml@refs\/heads\/main/);
 assert.match(job,/test "\$CONFIRM_PROJECT" = "sandman-combat-staging"/);
 assert.match(job,/ref: b4b40798b58aac46706dce984427e77d501855e7/);
 assert.match(job,/google-github-actions\/auth@v3/);
 assert.match(job,/if: \$\{\{ always\(\) \}\}/);
});
test('no deployment/IAM mutations, secret payloads, payments or email in runner',()=>{
 assert.match(script,/APPROVED_COMMANDS/);
 for(const term of ['("gcloud", "functions", "list")','("gcloud", "secrets", "describe")','("gcloud", "secrets", "versions", "list")','("gcloud", "secrets", "get-iam-policy")','("gcloud", "iam", "service-accounts", "describe")'])assert.ok(script.includes(term),term);
 assert.doesNotMatch(script,/gcloud\s+functions\s+deploy|gcloud\s+secrets\s+versions\s+access|firebase deploy|set-iam-policy|add-iam-policy-binding|stripe\.charges|emails\.send/);
 assert.match(script,/releaseReady": False/);
 assert.match(script,/deploymentAuthorized": False/);
 assert.deepEqual(review.scope.functions,['sendProposalPrepaidCashReceipt']);
 assert.equal(review.guards.deploymentAuthorized,false);
});
test('metadata is sanitized and missing target is a fail-closed inventory prerequisite',()=>{
 assert.match(script,/ABSENT_VERIFIED/);
 assert.match(script,/PRESENT_STOP_REBASELINE/);
 assert.match(script,/hashlib\.sha256/);
 assert.match(script,/enabledVersionPresent/);
 assert.match(script,/effectiveRuntimeAccess.*NOT_YET_VERIFIED/);
 assert.match(script,/sourceIsolationStatus.*NOT_YET_VERIFIED_TRANSITIVE_BUILD/);
 assert.match(script,/secretValueAccessAuthorized/);
});

test('cloud failures are sanitized and classified without hiding independent checks',()=>{
  for(const category of ['PERMISSION_DENIED','NOT_FOUND','AUTHENTICATION','CLI_ARGUMENT','UNKNOWN'])
    assert.ok(script.includes('"' + category + '"'),category);
  assert.match(script,/fingerprint = hashlib\.sha256\(result\.stderr\.encode\(\)\)/);
  assert.doesNotMatch(script,/print\(result\.stderr\)|errors\.append\(result\.stderr\)/);
  assert.match(script,/principal=.*str\(exc\)/);
  assert.match(script,/secret\.metadata/);
  assert.match(script,/secret\.versions/);
  assert.match(script,/secret\.iam/);
  assert.match(script,/readOnlyMetadataChecksPassed.*not errors/);
  assert.match(script,/return 1/);
});

test('deployer is proved by pinned trusted WIF and an authenticated staging read, not self-description',()=>{
 assert.match(script,/DEPLOYER = "sandman-practice-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com"/);
 assert.match(script,/workflow\.count\(job_marker\) == 1/);
 assert.match(script,/service_account: /);
 assert.match(script,/workload_identity_provider: projects\/991554514268/);
 assert.match(script,/WORKFLOW_IDENTITY_READ_API_VERIFIED_METADATA_NOT_READ/);
 const accounts=script.slice(script.indexOf('ACCOUNTS = ('),script.indexOf('APPROVED_COMMANDS'));
 assert.doesNotMatch(accounts,/sandman-practice-deployer/);
 assert.match(accounts,/sandman-practice-build/);
 assert.match(accounts,/sandman-billing-runtime/);
 assert.match(script,/releaseReady": False/);
 assert.match(script,/deploymentAuthorized": False/);
});
