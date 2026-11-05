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
                'function': {'state': 'ACTIVE', 'updateTime': 'before', 'buildConfig': {'runtime': 'nodejs22', 'source': 'old'},
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
            (baseline/(r.c.FUNCTIONS[0]+'.zip')).write_bytes(b'tampered')
            with patch.object(r, 'manifest', return_value=m), patch.object(r.subprocess, 'check_output', return_value=r.c.SHA):
                with self.assertRaisesRegex(RuntimeError, 'Rollback checksum'): r.package(source, baseline, root/'tampered-packages')

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
