import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
s = importlib.util.spec_from_file_location('authorization', ROOT/'scripts/staging/pr482-authorization.py')
a = importlib.util.module_from_spec(s); s.loader.exec_module(a)

class AuthorizationTests(unittest.TestCase):
    def env(self, credential):
        return {'GITHUB_REPOSITORY':'raulsandoval81-maker/SandmanSystem','GITHUB_REF':'refs/heads/main',
                'GITHUB_EVENT_NAME':'workflow_dispatch','CONFIRM_PROJECT':a.PROJECT,
                'GITHUB_WORKFLOW_REF':'raulsandoval81-maker/SandmanSystem/.github/workflows/paid-in-full-v2-readonly-preflight.yml@refs/heads/main',
                'RELEASE_SCOPE':'payment-arrangements-authorization','RELEASE_ACTION':'validate',
                'GOOGLE_APPLICATION_CREDENTIALS':str(credential),'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE':str(credential)}

    def credentials(self, path):
        data={'type':'external_account','audience':'//iam.googleapis.com/'+a.PROVIDER,
              'service_account_impersonation_url':'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+a.PRINCIPAL+':generateAccessToken'}
        path.write_text(json.dumps(data)); return data

    def test_rejects_branch_deployment_wrong_identity_and_personal_credentials_before_reads(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'credential.json'; good=self.credentials(path)
            for change in [{'GITHUB_REF':'refs/heads/task'}, {'RELEASE_ACTION':'deploy'},
                           {'CONFIRM_PROJECT':'sandmandashboard'}, {'RELEASE_SCOPE':'payment-arrangements'},
                           {'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE':'other'}]:
                env={**self.env(path),**change}
                with self.subTest(change=change), patch.dict(os.environ,env,clear=True), patch.object(a.subprocess,'run') as run:
                    with self.assertRaises(RuntimeError): a.verify(Path(folder)/'out')
                    run.assert_not_called()
            for change in [{'type':'authorized_user'}, {'audience':'other'}, {'service_account_impersonation_url':'other'}]:
                path.write_text(json.dumps({**good,**change}))
                with patch.dict(os.environ,self.env(path),clear=True), patch.object(a.subprocess,'run') as run:
                    with self.assertRaises(RuntimeError): a.guard()
                    run.assert_not_called()

    def test_exact_read_resources_success_and_no_baseline_pin(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); path=root/'credential.json'; self.credentials(path)
            def response(args, **kwargs):
                self.assertNotIn('--impersonate-service-account', ' '.join(args))
                self.assertTrue(args[1:4] == ['iam','service-accounts','get-iam-policy'] or
                                args[1:5] == ['iam','workload-identity-pools','providers','describe'])
                value={'name':a.PROVIDER,'state':'ACTIVE'} if 'providers' in args else {'etag':'unchanged'}
                return subprocess.CompletedProcess(args,0,json.dumps(value),'')
            original=(ROOT/'scripts/staging/pr482-release.json').read_bytes()
            with patch.dict(os.environ,self.env(path),clear=True), patch.object(a.subprocess,'run',side_effect=response) as run:
                a.verify(root/'out')
            self.assertEqual(run.call_count,6)
            results=json.loads((root/'out/results.json').read_text())
            self.assertEqual(results['status'],'PASS'); self.assertEqual(len(results['checks']),6)
            self.assertEqual({r['permission'] for r in results['checks']},{'iam.serviceAccounts.getIamPolicy','iam.workloadIdentityPoolProviders.get'})
            self.assertEqual((ROOT/'scripts/staging/pr482-release.json').read_bytes(),original)

    def test_denial_and_timeout_remain_failed_with_exact_resource_evidence(self):
        for failure in [subprocess.CompletedProcess([],1,'','PERMISSION_DENIED: iam.serviceAccounts.getIamPolicy'),
                        subprocess.TimeoutExpired('gcloud',60)]:
            with tempfile.TemporaryDirectory() as folder:
                root=Path(folder); path=root/'credential.json'; self.credentials(path)
                kwargs={'side_effect':failure} if isinstance(failure,Exception) else {'return_value':failure}
                with patch.dict(os.environ,self.env(path),clear=True), patch.object(a.subprocess,'run',**kwargs):
                    with self.assertRaisesRegex(RuntimeError,'baseline remains unpinned'): a.verify(root/'out')
                result=json.loads((root/'out/results.json').read_text())
                self.assertEqual(result['status'],'FAIL')
                self.assertEqual(result['checks'][0]['principal'],a.PRINCIPAL)
                self.assertEqual(result['checks'][0]['resource'],'projects/'+a.PROJECT+'/serviceAccounts/'+a.ACCOUNTS[0])
                self.assertTrue(result['checks'][0]['error'])

    def test_job_is_protected_isolated_and_has_no_build_capture_or_deploy(self):
        text=(ROOT/'.github/workflows/paid-in-full-v2-readonly-preflight.yml').read_text()
        job=text.split('  arrangements-authorization:',1)[1].split('  arrangements-validate:',1)[0]
        self.assertIn('environment: staging',job); self.assertIn('ref: ${{ github.sha }}',job)
        self.assertLess(job.index('r.protected()'),job.index('uses: google-github-actions/auth@v3'))
        self.assertIn('if: ${{ always() }}',job); self.assertIn(a.PRINCIPAL,job)
        for forbidden in ['npm ','pr482-capture.py','functions deploy','hosting.py','--impersonate-service-account','add-iam-policy-binding']:
            self.assertNotIn(forbidden,job)

if __name__ == '__main__': unittest.main()
