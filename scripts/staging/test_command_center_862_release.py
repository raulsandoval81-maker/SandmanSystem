"""Offline guards for the protected Command Center staging capability."""
import importlib.util, inspect, os
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch
SPEC=importlib.util.spec_from_file_location("cc_release",Path(__file__).with_name("command-center-862-release.py")); cc=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(cc)
class ReleaseTests(TestCase):
    def env(self,action,approval=False):
        value={"GITHUB_REPOSITORY":cc.REPO,"GITHUB_REF":"refs/heads/main","GITHUB_EVENT_NAME":"workflow_dispatch","GITHUB_WORKFLOW_REF":cc.WORKFLOW,"GITHUB_RUN_ATTEMPT":"1","CONFIRM_PROJECT":cc.PROJECT,"COMMAND_CENTER_ACTION":action}
        if approval: value.update(COMMAND_CENTER_APPROVAL=cc.APPROVAL,COMMAND_CENTER_TRANSPORT_APPROVAL=cc.TRANSPORT_APPROVAL)
        return value
    def test_guards_separate_readonly_and_mutation(self):
        with patch.dict(os.environ,self.env("command-center-862-release-preflight"),clear=True): cc.guard("command-center-862-release-preflight")
        with patch.dict(os.environ,self.env("command-center-862-staging-deploy",True),clear=True): cc.guard("command-center-862-staging-deploy",True)
        with patch.dict(os.environ,self.env("command-center-862-staging-deploy"),clear=True),self.assertRaises(RuntimeError): cc.guard("command-center-862-staging-deploy",True)
    def test_scope_is_exact(self):
        self.assertEqual(len(cc.FUNCTIONS),3); self.assertEqual(len(cc.HOSTING),7); self.assertEqual(cc.SOURCE_SHA,"23b910d9c1a2d7ddf6c829be505725a4d16862b6")
        self.assertNotIn("reconciliation-inventory",str(cc.HOSTING))
    def test_creation_is_atomic_post_not_deploy_upsert(self):
        source=inspect.getsource(cc.create_functions)
        self.assertIn('"functionId":name',source); self.assertNotIn("functions\", \"deploy",source); self.assertIn("len(after)==57",source)
        self.assertIn("all(after.get(k)==v for k,v in before.items())",source)
    def test_publish_is_exact_server_only_overlay(self):
        source=inspect.getsource(cc.publish_rules_hosting)
        self.assertIn("len(funcs)==57",source); self.assertIn("for path in HOSTING",source)
        self.assertIn('funcs==function_receipt["after"]',source)
        self.assertIn("reviewedHostingAllowlist",source); self.assertIn("firestoreRuleset",source)
        self.assertNotIn("reconciliation-inventory",source)
        rules=inspect.getsource(cc.rules_text)
        self.assertIn('allow read, write: if false;',rules); self.assertIn('not in part',rules)
    def test_package_source_isolated_to_command_center_dependencies(self):
        source=inspect.getsource(cc.package)
        for path in ("commandCenter.js","commandCenterPolicy.js","staffAuthorization.js","index.cjs","package-lock.json"):
            self.assertIn(path,source)
        self.assertIn('"ci"',source); self.assertIn("Package exports expanded",source)
        self.assertIn('shutil.rmtree(out/"node_modules")',source)
        self.assertIn("initializeApp",source); self.assertIn('validation.get("adminApps")==1',source)
    def test_publish_permissions_use_documented_hosting_identifiers(self):
        source=inspect.getsource(cc.preflight_publish)
        self.assertIn('"firebasehosting.sites.get"',source)
        self.assertIn('"firebasehosting.sites.update"',source)
        self.assertNotIn("firebasehosting.versions",source)
    def test_immutable_evidence_and_live_baseline_precede_creation(self):
        source=inspect.getsource(cc.create_functions)
        self.assertLess(source.index("approved_evidence()"),source.index("inventory(t)"))
        self.assertLess(source.index("inventory(t)"),source.index("generateUploadUrl"))
    def upload_fixture(self):
        return {"uploadUrl":"https://storage.googleapis.com/example-bucket/source.zip?X-Goog-Signature=synthetic",
                "storageSource":{"bucket":"example-bucket","object":"source.zip"}}
    def test_gen2_upload_has_exact_headers_and_no_credentials(self):
        upload=self.upload_fixture()
        with patch.object(cc.urllib.request,"urlopen") as open_url:
            open_url.return_value.__enter__.return_value.status=200
            self.assertEqual(cc.upload_gen2_source(upload,b"PK-example"),upload["storageSource"])
            open_url.assert_called_once()
            req=open_url.call_args.args[0]
            self.assertEqual(req.get_method(),"PUT")
            self.assertEqual(req.full_url,upload["uploadUrl"])
            self.assertEqual(req.data,b"PK-example")
            self.assertEqual(dict(req.header_items()),{"Content-type":"application/zip"})
            self.assertEqual(open_url.call_args.kwargs,{"timeout":120})
    def test_invalid_signed_url_and_storage_source_fail_closed(self):
        cases=[{"uploadUrl":"http://storage.googleapis.com/b/o","storageSource":{"bucket":"b","object":"o"}},
               {"uploadUrl":"https://storage.googleapis.com.example.invalid/b/o","storageSource":{"bucket":"b","object":"o"}},
               {"uploadUrl":"https://user@storage.googleapis.com/b/o","storageSource":{"bucket":"b","object":"o"}},
               {"uploadUrl":"https://storage.googleapis.com/b/o","storageSource":{"bucket":"b"}},
               {"storageSource":{"bucket":"b","object":"o"}}]
        with patch.object(cc.urllib.request,"urlopen") as open_url:
            for case in cases:
                with self.subTest(case=case),self.assertRaises(RuntimeError):
                    cc.upload_gen2_source(case,b"PK-example")
            with self.assertRaises(RuntimeError):
                cc.upload_gen2_source(self.upload_fixture(),b"")
            open_url.assert_not_called()
    def test_upload_403_is_redacted_and_never_retried(self):
        upload=self.upload_fixture()
        error=cc.urllib.error.HTTPError(upload["uploadUrl"],403,"Forbidden",None,None)
        with patch.object(cc.urllib.request,"urlopen",side_effect=error) as open_url:
            with self.assertRaisesRegex(RuntimeError,"HTTP 403.*STOP_NO_RETRY") as caught:
                cc.upload_gen2_source(upload,b"PK-example")
            self.assertNotIn("synthetic",str(caught.exception))
            open_url.assert_called_once()
    def test_create_uses_validated_storage_source_after_upload(self):
        source=inspect.getsource(cc.create_functions)
        self.assertLess(source.index("storage=upload_gen2_source"),source.index('"functionId":name'))
        self.assertIn('"storageSource":storage',source)
        self.assertNotIn("x-goog-content-length-range",source)
if __name__=="__main__": main()
