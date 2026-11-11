import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('inventory',ROOT/'scripts/production/receipt_intake_inventory.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class InventoryTests(unittest.TestCase):
 def test_project_and_candidate_guards(self):
  env={'GITHUB_REPOSITORY':'raulsandoval81-maker/SandmanSystem','GITHUB_REF':'refs/heads/main','GITHUB_WORKFLOW_REF':m.WORKFLOW,'CONFIRM_PROJECT':m.PROJECT,'CONFIRM_SOURCE_SHA':m.SHA}
  m.guard(env)
  for key in env:
   with self.subTest(key=key),self.assertRaises(RuntimeError):m.guard({**env,key:'wrong'})
 def test_only_reads_and_readonly_posts(self):
  f=f'https://cloudfunctions.googleapis.com/v1/projects/{m.PROJECT}/locations/us-central1/functions/sendEnrollmentIntakeEmail'
  m.permitted(f);m.permitted(f+':generateDownloadUrl',{'versionId':'6'})
  for url,payload in [(f,{}),(f+':call',{}),(f.replace(m.PROJECT,'sandman-combat-staging'),None),(f+':generateDownloadUrl',{'sourceUploadUrl':'evil'}),('https://secretmanager.googleapis.com/v1/projects/sandmandashboard/secrets/RESEND_API_KEY/versions/latest:access',None)]:
   with self.subTest(url=url),self.assertRaises(RuntimeError):m.permitted(url,payload)
 def test_signed_download_scope(self):
  m.permitted('https://storage.googleapis.com/approved/archive?signature=opaque',signed=True)
  for u in ['http://storage.googleapis.com/a','https://storage.googleapis.com.evil.test/a','https://user@storage.googleapis.com/a']:
   with self.assertRaises(RuntimeError):m.permitted(u,signed=True)
 def test_sanitization(self):
  r=m.sanitize({'environmentVariables':{'SECRET':'sensitive'},'env':[{'name':'KEY','value':'hidden'}],'secretEnvironmentVariables':[{'key':'RESEND_API_KEY','version':'latest'}],'sourceUploadUrl':'secret-url'})
  for secret in ['sensitive','hidden','secret-url']:self.assertNotIn(secret,str(r))
  self.assertEqual(r['secretEnvironmentVariables'][0]['key'],'RESEND_API_KEY')
 def test_manifest_rejects_duplicate_paths_and_repeated_pages(self):
  valid={'path':'/index.html','hash':'a'*64,'status':'ACTIVE'}
  self.assertEqual(m.manifest(lambda _: {'files':[valid]},'sites/sandman-main/versions/v'),{'/index.html':'a'*64})
  with self.assertRaises(RuntimeError):m.manifest(lambda _: {'files':[valid,valid]},'v')
  with self.assertRaises(RuntimeError):m.manifest(lambda _: {'files':[],'nextPageToken':'same'},'v')
 def test_callable_and_asset_inventory_is_narrow(self):
  self.assertEqual(len(m.FUNCTIONS),10)
  self.assertEqual(len(m.ASSETS),8)
  self.assertNotIn('acceptProposalClientReview',m.FUNCTIONS)
  self.assertFalse(any('runtime-environment' in p or 'sponsor' in p for p in m.ASSETS))
  for p in m.ASSETS:self.assertTrue((ROOT/('public'+p)).is_file())
 def test_management_promotion_inventory_is_exact_and_readonly(self):
  from unittest.mock import patch
  with patch.multiple(m, SHA=m.SHA, FUNCTIONS=m.FUNCTIONS, ASSETS=m.ASSETS):
   m.configure_inventory('management-promotion')
   self.assertEqual(m.SHA, '01dfea8ac9660a313a32b4a02ab210c921a2d9ef')
   self.assertEqual(len(m.FUNCTIONS), 13)
   self.assertEqual(len(m.ASSETS), 12)
   self.assertTrue({'createProposalDraft','updateProposalDraft','issueProposalClientReview',
    'recordProposalPrepaidCash'} <= m.FUNCTIONS.keys())
   for path in m.PROMOTION_ASSETS: self.assertTrue((ROOT/('public'+path)).is_file())
   endpoint=f'https://cloudfunctions.googleapis.com/v2alpha/projects/{m.PROJECT}/locations/us-central1/functions/createProposalDraft'
   m.permitted(endpoint+':generateDownloadUrl', {})
   with self.assertRaises(RuntimeError): m.permitted(endpoint+':call', {})
   with self.assertRaises(RuntimeError): m.configure_inventory('deploy')
 def test_deployment_not_exposed(self):
  src=(ROOT/'scripts/production/receipt_intake_inventory.py').read_text()
  self.assertNotIn('firebase deploy',src);self.assertNotIn('setIamPolicy',src)
  workflow=(ROOT/'.github/workflows/production-management-readonly-inventory.yml').read_text()
  self.assertIn('environment: production',workflow);self.assertIn(m.SHA,workflow);self.assertIn(m.MANAGEMENT_PROMOTION_SHA,workflow)
  self.assertIn('default: false',workflow);self.assertNotIn('mode: deploy',workflow)
 def test_archive_not_exported(self):
  src=(ROOT/'scripts/production/receipt_intake_inventory.py').read_text()
  self.assertNotIn('write_bytes(archive)',src);self.assertIn("'archiveSha256':sha(archive)",src)
  workflow=(ROOT/'.github/workflows/production-management-readonly-inventory.yml').read_text()
  self.assertIn('path: evidence/',workflow)
if __name__=='__main__':unittest.main()
