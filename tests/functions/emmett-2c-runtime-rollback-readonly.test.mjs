import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync('scripts/staging/emmett-2c-runtime-rollback-readonly.py','utf8');
const workflow=readFileSync('.github/workflows/staging-exact-sha-release.yml','utf8');
test('runtime review uses allowlisted reads and remains nonauthorizing',()=>{
 for(const cmd of ['("gcloud", "functions", "list")','("gcloud", "secrets", "get-iam-policy")','("gcloud", "projects", "get-iam-policy")'])
   assert.ok(script.includes(cmd),cmd);
 for(const forbidden of ['functions", "deploy','secrets", "versions", "access','set-iam-policy','emails.send','firebase deploy'])
   assert.ok(!script.includes(forbidden),forbidden);
 assert.match(script,/"deploymentAuthorized": False/);
 assert.match(script,/"releaseReady": False/);
 assert.match(script,/REAL|STAGING_RECIPIENT_SANDBOX_NOT_ENFORCED/);
 assert.match(script,/EXISTING_ATHLETE_RECONCILIATION_UNCERTIFIED/);
 assert.match(script,/effectiveSecretAccess": "NOT_PROVEN_BY_POLICY_READ"/);
});
test('protected staging workflow does not grant new deploy authorization',()=>{
 assert.match(workflow,/emmett-2c-runtime-rollback-readonly:/);
 assert.match(workflow,/inputs.action == 'emmett-2c-runtime-rollback-readonly'/);
 const section=workflow.split('  emmett-2c-runtime-rollback-readonly:',2)[1];
 assert.match(section,/environment: staging/);
 assert.match(section,/service_account: sandman-practice-deployer@sandman-combat-staging\.iam\.gserviceaccount\.com/);
 assert.match(section,/ref: b4b40798b58aac46706dce984427e77d501855e7/);
 assert.doesNotMatch(section,/gcloud functions deploy|firebase deploy|gcloud .* set-iam-policy/);
});
test('only synthetic/transport/rollback unverified findings are claimed',()=>{
 for(const guard of ['NOT_PROVEN_BY_SOURCE_CHECKS','NOT_PROVEN_BY_POLICY_READ',
 'NOT_CERTIFIED_BLOCKS_STAGING_EMAIL','NOT_CAPTURED_BY_THIS_WORKFLOW','NOT_CERTIFIED'])
 assert.ok(script.includes(guard),guard);
 assert.match(script,/NEW_FUNCTION_DELETE_ONLY_WITH_SEPARATE_APPROVAL/);
});
