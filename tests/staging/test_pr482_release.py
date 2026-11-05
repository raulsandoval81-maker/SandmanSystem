import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT/path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module
r = load('release', 'scripts/staging/pr482-release.py')
h = load('hosting', 'scripts/staging/pr482-hosting.py')

class ReleaseTests(unittest.TestCase):
    def env(self):
        return {'GITHUB_REPOSITORY': 'raulsandoval81-maker/SandmanSystem', 'GITHUB_REF': 'refs/heads/main',
                'GITHUB_EVENT_NAME': 'workflow_dispatch', 'CONFIRM_PROJECT': r.c.PROJECT,
                'GITHUB_WORKFLOW_REF': 'raulsandoval81-maker/SandmanSystem/.github/workflows/paid-in-full-v2-readonly-preflight.yml@refs/heads/main',
                'APPROVE_RELEASE': r.manifest()['approval']}

    def test_exact_source_seven_functions_seven_paths(self):
        m = r.manifest()
        self.assertEqual(m['applicationSha'], 'f402c04ee27a5ca9309a422221c3556f6523588a')
        self.assertEqual(len(set(m['functions'])), 7); self.assertEqual(len(set(m['assets'])), 7)
        self.assertFalse(m['automaticRollback']); self.assertFalse(m['productionAuthorized'])

    def test_global_and_staging_custom_role_queries_use_correct_scope(self):
        with patch.object(r.c.subprocess, 'check_output', return_value='{}') as query:
            r.c.role_state('roles/cloudfunctions.admin')
            self.assertNotIn('--project='+r.c.PROJECT, query.call_args.args[0])
            r.c.role_state('projects/'+r.c.PROJECT+'/roles/stagingDeployer')
            self.assertIn('--project='+r.c.PROJECT, query.call_args.args[0])
        with self.assertRaisesRegex(RuntimeError, 'outside staging'):
            r.c.role_state('projects/production/roles/admin')

    def test_capture_includes_both_deployer_impersonation_policies(self):
        with patch.object(r.c, 'gc', return_value={}) as query:
            state = r.c.authorization_state({})
        self.assertEqual(set(state['accounts']), {
            'sandman-practice-deployer@'+r.c.PROJECT+'.iam.gserviceaccount.com',
            'sandman-staging-deployer@'+r.c.PROJECT+'.iam.gserviceaccount.com'})
        self.assertEqual(sum(args.args[0][:3] == ['iam','service-accounts','get-iam-policy']
                             for args in query.call_args_list), 2)

    def test_no_dispatch_credentials_no_deployment(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'Protected staging'): r.protected(True)

    def test_all_authorization_boundaries_reject_drift(self):
        for key in ['GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'CONFIRM_PROJECT', 'GITHUB_WORKFLOW_REF', 'APPROVE_RELEASE']:
            env = self.env(); env[key] = 'wrong'
            with self.subTest(key=key), patch.dict(os.environ, env, clear=True):
                with self.assertRaises(RuntimeError): r.protected(True)

    def test_separate_approval_is_required(self):
        env = self.env(); del env['APPROVE_RELEASE']
        with patch.dict(os.environ, env, clear=True):
            r.protected()
            with self.assertRaisesRegex(RuntimeError, 'Separate explicit'): r.protected(True)

    def test_unapproved_function_rejected_before_cloud_access(self):
        with patch.dict(os.environ, self.env(), clear=True), patch.object(r.c, 'function_state', side_effect=AssertionError('cloud read')):
            with self.assertRaisesRegex(RuntimeError, 'outside release scope'): r.deploy_function('other', '.', '.', '.')

    def test_archive_rejects_traversal_duplicates_and_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)/'test.zip'
            for name in ['../bad.js', '/bad.js', 'dir\\bad.js']:
                with zipfile.ZipFile(p, 'w') as z: z.writestr(name, 'bad')
                with self.assertRaisesRegex(RuntimeError, 'Unsafe archive'): r.contents(p)
            with zipfile.ZipFile(p, 'w') as z:
                entry = zipfile.ZipInfo('link'); entry.external_attr = 0o120777 << 16; z.writestr(entry, '../bad')
            with self.assertRaisesRegex(RuntimeError, 'symlinks'): r.contents(p)

    def test_overlay_preserves_every_unrelated_file(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder); live = {'/untouched.js': 'unchanged'}
            for index, path in enumerate(r.c.ASSETS):
                f = source/('public'+path); f.parent.mkdir(parents=True, exist_ok=True); f.write_text('approved '+str(index))
                if path != r.manifest()['newAssets'][0]: live[path] = 'oldhash'
            updated, blobs = h.overlay(source, live)
            self.assertEqual(updated['/untouched.js'], 'unchanged')
            self.assertEqual({p for p in updated if updated[p] != live.get(p)}, set(r.c.ASSETS))
            self.assertEqual(len(blobs), 7)
            del live[r.c.ASSETS[0]]
            with self.assertRaisesRegex(RuntimeError, 'existing path'): h.overlay(source, live)

    def before(self):
        return {'functionIam': {'etag': 'x'}, 'runIam': {'etag': 'x'},
                'function': {'name': 'projects/sandman-combat-staging/locations/us-central1/functions/createProposalDraft',
                             'state': 'ACTIVE', 'updateTime': 'before', 'buildConfig': {'runtime': 'nodejs22', 'source': 'old'},
                             'serviceConfig': {'revision': 'old', 'serviceAccountEmail': 'runtime', 'secretEnvironmentVariables': [{'key': 'SECRET', 'version': 'latest'}]}},
                'run': {'metadata': {'annotations': {'run.googleapis.com/invoker-iam-disabled': 'true'}},
                        'spec': {'template': {'metadata': {'name': 'old'}, 'spec': {'containers': [{'image': 'old', 'env': [{'name': 'ACK', 'value': 'staging'}]}]}}}}}

    def after(self, before):
        after = copy.deepcopy(before); after['function']['serviceConfig']['revision'] = 'new'
        after['function']['buildConfig']['source'] = 'new'; after['function']['updateTime'] = 'new'
        after['run']['spec']['template']['metadata']['name'] = 'new'
        after['run']['spec']['template']['spec']['containers'][0]['image'] = 'new'
        return after

    def test_expected_revision_and_source_changes_only(self):
        before = self.before(); r.compare_after(before, self.after(before))

    def test_run15_provider_identity_labels_added_by_gcloud_are_allowed_only_when_exact(self):
        before = self.before()
        after = self.after(before)
        labels = after['run']['spec']['template']['metadata'].setdefault('labels', {})
        labels.update({'goog-drz-cloudfunctions-id': 'createproposaldraft',
                       'goog-drz-cloudfunctions-location': 'us-central1'})
        r.compare_after(before, after)
        for key, wrong in [('goog-drz-cloudfunctions-id', 'other-function'),
                           ('goog-drz-cloudfunctions-location', 'us-east1')]:
            mutated = copy.deepcopy(after)
            mutated['run']['spec']['template']['metadata']['labels'][key] = wrong
            with self.subTest(key=key), self.assertRaisesRegex(RuntimeError, 'runtime specification'):
                r.compare_after(before, mutated)
        extra = copy.deepcopy(after)
        extra['run']['spec']['template']['metadata']['labels']['unexpected'] = 'changed'
        with self.assertRaisesRegex(RuntimeError, 'runtime specification'):
            r.compare_after(before, extra)

    def test_existing_provider_label_removal_remains_blocked(self):
        before = self.before()
        before['run']['spec']['template']['metadata']['labels'] = {
            'goog-drz-cloudfunctions-id': 'createproposaldraft'}
        after = self.after(before)
        after['run']['spec']['template']['metadata']['labels'].clear()
        with self.assertRaisesRegex(RuntimeError, 'runtime specification'):
            r.compare_after(before, after)

    def test_run15_readonly_audit_checks_source_health_other_functions_and_hosting(self):
        audit = load('pr482_run15_recovery', 'scripts/staging/pr482-run15-readonly-recovery.py')
        before = self.before()
        after = self.after(before)
        after['function']['serviceConfig']['revision'] = audit.REVISION
        after['function']['buildConfig']['source'] = {'storageSource': {
            'bucket': 'staging-source', 'object': 'original.zip', 'generation': '123'}}
        after['run']['spec']['template']['metadata']['labels'] = {
            'goog-drz-cloudfunctions-id': 'createproposaldraft',
            'goog-drz-cloudfunctions-location': 'us-central1'}
        after['run']['status'] = {'traffic': [{'revisionName': audit.REVISION, 'percent': 100}],
                                  'latestReadyRevisionName': audit.REVISION}
        state = {'functions': {name: copy.deepcopy(before) for name in r.c.FUNCTIONS},
                 'authorization': {'verified': True}, 'hosting': {'files': {'x': 'y'}}}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            preflight = root/'preflight'; receipt = root/'receipt'
            (preflight/'baseline').mkdir(parents=True)
            (preflight/'packages').mkdir()
            (receipt/'functions').mkdir(parents=True)
            (preflight/'baseline'/'baseline.json').write_text(json.dumps(state))
            (preflight/'packages'/'createProposalDraft-files.json').write_text(json.dumps({'file.js': 'hash'}))
            (receipt/'functions'/'createProposalDraft-after.json').write_text(json.dumps(after))
            env = {'GITHUB_REPOSITORY': 'raulsandoval81-maker/SandmanSystem',
                   'GITHUB_REF': 'refs/heads/main', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
                   'CONFIRM_PROJECT': 'sandman-combat-staging',
                   'GITHUB_WORKFLOW_REF': 'raulsandoval81-maker/SandmanSystem/.github/workflows/pr482-run15-readonly-recovery.yml@refs/heads/main'}
            def capture(name):
                return after if name == audit.FIRST else state['functions'][name]
            with patch.dict(os.environ, env, clear=True), \
                 patch.object(audit.r, 'manifest', return_value={'baselineSha256': 'pin'}), \
                 patch.object(audit.c, 'baseline_digest', return_value='pin'), \
                 patch.object(audit.c, 'function_state', side_effect=capture), \
                 patch.object(audit.c, 'authorization_state', return_value=state['authorization']), \
                 patch.object(audit.c, 'hosting_state', return_value=state['hosting']), \
                 patch.object(audit.c, 'gc', return_value=[{'textPayload': 'STARTUP TCP probe succeeded'}]), \
                 patch.object(audit.r, 'contents', return_value={'file.js': b'data'}), \
                 patch.object(audit.r, 'hashes', return_value={'file.js': 'hash'}), \
                 patch.object(audit.subprocess, 'run') as cloud_cp:
                result = audit.verify(preflight, receipt, root/'evidence.json', 'read-only-token')
                self.assertEqual(result['status'], 'VERIFIED_PARTIAL_STAGING_DEPLOYMENT')
                self.assertFalse(result['deploymentAuthorized'])
                self.assertEqual(cloud_cp.call_count, 1)
                self.assertEqual(cloud_cp.call_args.args[0][:3], ['gcloud', 'storage', 'cp'])
                with patch.object(audit.c, 'hosting_state', return_value={'files': {'x': 'changed'}}):
                    with self.assertRaisesRegex(RuntimeError, 'Hosting changed'):
                        audit.verify(preflight, receipt, root/'reject.json', 'read-only-token')
                with patch.object(audit.r, 'hashes', return_value={'file.js': 'wrong'}):
                    with self.assertRaisesRegex(RuntimeError, 'source archive'):
                        audit.verify(preflight, receipt, root/'reject-source.json', 'read-only-token')

    def test_runtime_identity_secret_iam_and_invoker_drift_reject(self):
        before = self.before()
        for mutation in [lambda x: x['function']['serviceConfig'].update(serviceAccountEmail='other'),
                         lambda x: x['function']['serviceConfig'].update(secretEnvironmentVariables=[]),
                         lambda x: x['runIam'].update(bindings=[{'members':['allUsers']}]),
                         lambda x: x['run']['metadata']['annotations'].update({'run.googleapis.com/invoker-iam-disabled': 'false'}),
                         lambda x: x['run']['spec']['template']['spec']['containers'][0]['env'].clear()]:
            after = self.after(before); mutation(after)
            with self.assertRaises(RuntimeError): r.compare_after(before, after)

    def test_missing_rollback_or_baseline_blocks_packages(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder); (p/'baseline.json').write_text('{}'); (p/'rollback.json').write_text('{}')
            with patch.object(r.subprocess, 'check_output', return_value=r.c.SHA):
                with self.assertRaisesRegex(RuntimeError, 'baseline'): r.package(p, p, p/'packages')

    def test_packages_preserve_entry_dependencies_and_only_overlay_approved_modules(self):
        import hashlib
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); source = root/'source'; baseline = root/'baseline'
            source.mkdir(); baseline.mkdir()
            state = {'functions': {}}; rollbacks = {}
            for name in r.c.FUNCTIONS:
                src = {'bucket': 'staging-source', 'object': name+'.zip', 'generation': '123'}
                state['functions'][name] = {'function': {'buildConfig': {'source': {'storageSource': src}}}}
                archive = baseline/(name+'.zip')
                with zipfile.ZipFile(archive, 'w') as z:
                    z.writestr('package.json', json.dumps({'main':'entry.cjs','dependencies':{'firebase-admin':'12.5.0'},'scripts':{'build':'old compiler'}}))
                    z.writestr('entry.cjs', 'exports.'+name+' = require("./lib/runtime.js");')
                    z.writestr('lib/runtime.js', 'module.exports = require("./billing/prepaidMembershipPolicy.js");')
                    z.writestr('src/unchanged.ts', 'unchanged')
                rollbacks[name] = {'source':src, 'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
            for module in r.manifest()['modules']:
                p = source/'functions/lib'/module; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('module.exports = {};')
            r.save(baseline/'baseline.json', state); r.save(baseline/'rollback.json', rollbacks)
            m = r.manifest(); m['baselineSha256'] = r.c.digest(state)
            with patch.object(r, 'manifest', return_value=m), patch.object(r.subprocess, 'check_output', return_value=r.c.SHA):
                r.package(source, baseline, root/'packages')
            for name in r.c.FUNCTIONS:
                files = root/'packages'/name
                self.assertEqual((files/'entry.cjs').read_text(), 'exports.'+name+' = require("./lib/runtime.js");')
                self.assertEqual((files/'src/unchanged.ts').read_text(), 'unchanged')
                pkg = json.loads((files/'package.json').read_text())
                self.assertEqual(pkg['dependencies'], {'firebase-admin':'12.5.0'})
                self.assertEqual(pkg['scripts']['gcp-build'], '')
            r.save(baseline/'receipt.json', {'baselineSha256':r.c.digest(state)})
            with patch.object(r.subprocess, 'check_output', return_value=r.c.SHA):
                r.package(source, baseline, root/'candidate', candidate=True)
            prepared = json.loads((root/'candidate/prepared.json').read_text())
            self.assertTrue(prepared['candidateOnly'])
            env = self.env()
            with patch.dict(os.environ, env, clear=True), patch.object(r, 'manifest', return_value=m):
                with self.assertRaisesRegex(RuntimeError, 'Unverified packages'):
                    r.deploy_function(r.c.FUNCTIONS[0], baseline, root/'candidate', root/'receipts')
            (baseline/(r.c.FUNCTIONS[0]+'.zip')).write_bytes(b'tampered')
            with patch.object(r, 'manifest', return_value=m), patch.object(r.subprocess, 'check_output', return_value=r.c.SHA):
                with self.assertRaisesRegex(RuntimeError, 'Rollback checksum'): r.package(source, baseline, root/'tampered-packages')

    def test_baseline_mismatch_is_fail_closed_and_redacts_sensitive_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            state = {'authorization': {'etag': 'one'},
                     'functions': {'example': {'environmentVariables': {'PASSWORD': 'do-not-publish'},
                                               'state': 'ACTIVE'}}}
            out = Path(folder)/'packages'
            self.assertTrue(r.write_baseline_mismatch(state, '0'*64, out))
            evidence = json.loads((Path(folder)/'baseline-mismatch.json').read_text())
            self.assertEqual(evidence['expectedBaselineSha256'], '0'*64)
            self.assertEqual(evidence['observedBaselineSha256'], r.c.digest(state))
            self.assertNotIn('do-not-publish', json.dumps(evidence))
            self.assertEqual(evidence['fingerprints']['/functions/example/environmentVariables'], '[sensitive-field-omitted]')
            self.assertFalse(r.write_baseline_mismatch(state, r.c.digest(state), out))

    def hosting_fixture(self):
        return {'release': {'name':'release-unchanged', 'releaseUser':{'email':'staff@example.test','imageUrl':'avatar-old'},
                            'version':{'name':'version-unchanged','createUser':{'email':'creator@example.test','imageUrl':'avatar-old'},
                                       'finalizeUser':{'email':'finalizer@example.test','imageUrl':'avatar-old'}}},
                'version': {'name':'version-unchanged','status':'FINALIZED','config':{},
                            'createUser':{'email':'creator@example.test','imageUrl':'avatar-old'},
                            'finalizeUser':{'email':'finalizer@example.test','imageUrl':'avatar-old'}},
                'files': {'/preserved.js':'unchanged-hash'}}

    def test_only_five_proven_hosting_avatar_paths_are_normalized_without_mutating_evidence(self):
        expected = {('release','releaseUser','imageUrl'), ('release','version','createUser','imageUrl'),
                    ('release','version','finalizeUser','imageUrl'), ('version','createUser','imageUrl'),
                    ('version','finalizeUser','imageUrl')}
        self.assertEqual(set(r.c.HOSTING_PROFILE_IMAGE_PATHS), expected)
        state={'hosting':self.hosting_fixture()}; original=copy.deepcopy(state); changed=copy.deepcopy(state)
        for path in expected:
            parent=changed['hosting']
            for key in path[:-1]: parent=parent[key]
            parent[path[-1]]='avatar-rotated'
        self.assertNotEqual(r.c.digest(state),r.c.digest(changed))
        self.assertEqual(r.c.baseline_digest(state),r.c.baseline_digest(changed))
        self.assertEqual(r.c.canonical_hosting(state['hosting']),r.c.canonical_hosting(changed['hosting']))
        self.assertEqual(state,original)

    def test_identity_release_asset_iam_and_sensitive_drift_still_changes_digest(self):
        state={'hosting':self.hosting_fixture(), 'functions':{'example':{'revision':'old','environmentVariables':{'SECRET':'old'}}},
               'authorization':{'policy':{'members':['staff'],'permissions':['read']}}, 'applicationSha':r.c.SHA}
        mutations=[lambda x:x['hosting']['release'].update(name='other-release'),
                   lambda x:x['hosting']['version'].update(name='other-version'),
                   lambda x:x['hosting']['version'].update(status='DELETED'),
                   lambda x:x['hosting']['release']['releaseUser'].update(email='other@example.test'),
                   lambda x:x['hosting']['release']['version']['createUser'].update(email='other@example.test'),
                   lambda x:x['hosting']['release']['version']['finalizeUser'].update(email='other@example.test'),
                   lambda x:x['hosting']['version']['createUser'].update(email='other@example.test'),
                   lambda x:x['hosting']['version']['finalizeUser'].update(email='other@example.test'),
                   lambda x:x['hosting']['version']['config'].update(headers=['changed']),
                   lambda x:x['hosting']['files'].update({'/preserved.js':'changed-hash'}),
                   lambda x:x['functions']['example'].update(revision='new'),
                   lambda x:x['functions']['example']['environmentVariables'].update(SECRET='changed'),
                   lambda x:x['authorization']['policy']['permissions'].append('write'),
                   lambda x:x.update(applicationSha='other'),
                   lambda x:x['hosting']['version'].update(imageUrl='not-an-allowed-path')]
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index):
                changed=copy.deepcopy(state);mutate(changed)
                self.assertNotEqual(r.c.baseline_digest(state),r.c.baseline_digest(changed))

    def test_unexpected_avatar_field_type_remains_pinned(self):
        state={'hosting':self.hosting_fixture()}; changed=copy.deepcopy(state)
        changed['hosting']['version']['createUser']['imageUrl']={'unexpected':'data'}
        self.assertNotEqual(r.c.baseline_digest(state),r.c.baseline_digest(changed))

    def test_diagnostics_use_same_canonical_pin_and_still_fail_for_identity_change(self):
        state={'hosting':self.hosting_fixture()}; changed=copy.deepcopy(state)
        changed['hosting']['version']['createUser']['imageUrl']='rotated'
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'packages';pin=r.c.baseline_digest(state)
            self.assertFalse(r.write_baseline_mismatch(changed,pin,out))
            changed['hosting']['version']['createUser']['email']='changed@example.test'
            self.assertTrue(r.write_baseline_mismatch(changed,pin,out))
            evidence=json.loads((Path(folder)/'baseline-mismatch.json').read_text())
            self.assertEqual(evidence['observedBaselineSha256'],r.c.baseline_digest(changed))

    def test_hosting_verify_accepts_avatar_rotation_but_rejects_identity_change_without_writes(self):
        import gzip,hashlib
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'source';baseline=root/'baseline';baseline.mkdir()
            hosting=self.hosting_fixture()
            for index,path in enumerate(r.c.ASSETS):
                f=source/('public'+path);f.parent.mkdir(parents=True,exist_ok=True);f.write_text('approved '+str(index))
                if path not in r.manifest()['newAssets']:hosting['files'][path]='old-hash'
            dep=source/'public/management/billing/prepaid-terms.js';dep.write_text('unchanged dependency')
            hosting['files']['/management/billing/prepaid-terms.js']=hashlib.sha256(gzip.compress(dep.read_bytes(),mtime=0)).hexdigest()
            state={'hosting':hosting};r.save(baseline/'baseline.json',state)
            m=r.manifest();m['baselineSha256']=r.c.baseline_digest(state)
            live=copy.deepcopy(hosting);live['release']['releaseUser']['imageUrl']='rotated'
            with patch.dict(os.environ,{**self.env(),'STAGING_HOSTING_TOKEN':'test-only'},clear=True), \
                 patch.object(h.r,'manifest',return_value=m),patch.object(h.subprocess,'check_output',return_value=r.c.SHA), \
                 patch.object(h.c,'hosting_state',return_value=live),patch.object(h,'request',side_effect=AssertionError('cloud write')):
                h.run('verify',str(source),str(baseline),str(root/'verify'),None)
                live['release']['releaseUser']['email']='changed@example.test'
                with self.assertRaisesRegex(RuntimeError,'Live Hosting baseline drift'):
                    h.run('verify',str(source),str(baseline),str(root/'reject'),None)

    def test_workflow_is_separate_protected_scope_and_no_other_mutations(self):
        workflow = (ROOT/'.github/workflows/paid-in-full-v2-readonly-preflight.yml').read_text().split('  arrangements-validate:', 1)[1]
        self.assertIn("needs: arrangements-validate", workflow)
        self.assertIn("inputs.action == 'deploy'", workflow)
        self.assertEqual(workflow.count('environment: staging'), 2)
        self.assertIn('ref: ${{ github.sha }}', workflow)
        self.assertIn('pr482-release.py aggregate', workflow)
        self.assertLess(workflow.index('Reject Hosting drift'), workflow.index('Update and verify one existing Function'))
        all_tools = '\n'.join((ROOT/('scripts/staging/'+name)).read_text() for name in ['pr482-capture.py','pr482-release.py','pr482-hosting.py'])
        for forbidden in ['add-iam-policy-binding', 'set-iam-policy', '--no-invoker-iam-check', 'firebase deploy', 'stripe checkout']:
            self.assertNotIn(forbidden, all_tools)

if __name__ == '__main__': unittest.main()
