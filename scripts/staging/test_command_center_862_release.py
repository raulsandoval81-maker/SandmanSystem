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
if __name__=="__main__": main()
