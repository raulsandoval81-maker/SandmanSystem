"""Offline safety regressions for Command Center #862 GET-only staging preflight."""
import importlib.util
import os
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("command_center_readonly",
                                                Path(__file__).with_name("command-center-862-readonly.py"))
cc = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cc)


class CommandCenterReadOnlyTests(TestCase):
    def test_requires_exact_staging_workflow_and_project(self):
        expected = {
            "GITHUB_REPOSITORY": cc.REPO,
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_WORKFLOW_REF": cc.WORKFLOW_REF,
            "GITHUB_RUN_ATTEMPT": "1",
            "CONFIRM_PROJECT": cc.PROJECT,
            "COMMAND_CENTER_ACTION": cc.ACTION,
        }
        with patch.dict(os.environ, expected, clear=True):
            cc.guard()
        for field in expected:
            bad = dict(expected)
            bad[field] = "untrusted"
            with self.subTest(field=field), patch.dict(os.environ, bad, clear=True):
                with self.assertRaises(RuntimeError):
                    cc.guard()
        with patch.dict(os.environ, {**expected, "COMMAND_CENTER_APPROVAL": "ANY"}, clear=True):
            with self.assertRaises(RuntimeError):
                cc.guard()

    def test_reviewed_source_has_exact_fifteen_paths(self):
        self.assertEqual(len(cc.CHANGED), 15)
        self.assertEqual(len(set(cc.CHANGED)), 15)
        self.assertEqual(len(cc.HOSTING), 7)
        self.assertEqual(len(cc.FUNCTIONS), 3)
        self.assertEqual(cc.MERGED_SHA, "23b910d9c1a2d7ddf6c829be505725a4d16862b6")
        self.assertFalse((ROOT / ("public" + cc.PRIVATE_INVENTORY_PATH)).exists())
        reviewed = cc.source()
        self.assertEqual(len(reviewed), 15)

    def test_reviewed_rules_add_only_server_private_collections(self):
        live = (ROOT / "scripts/staging/p0-containment/firestore.rules").read_text()
        reviewed = (ROOT / "firestore.rules").read_text()
        result = cc.rules_candidate(live, reviewed)
        self.assertEqual(set(result), {
            "liveRuleSha256", "reviewedRuleSha256", "inMemoryCandidateSha256"})
        self.assertNotEqual(result["liveRuleSha256"], result["inMemoryCandidateSha256"])

    def test_preexisting_command_center_rules_stop(self):
        reviewed = (ROOT / "firestore.rules").read_text()
        with self.assertRaises(RuntimeError):
            cc.rules_candidate(reviewed, reviewed)

    def test_unrelated_rules_drift_rejected(self):
        reviewed = (ROOT / "firestore.rules").read_text()
        stage = (ROOT / "scripts/staging/p0-containment/firestore.rules").read_text()
        stage = stage.replace("       DEFAULT CLOSED", "       SOMETHING ELSE", 1)
        with self.assertRaises(RuntimeError):
            cc.rules_candidate(stage, reviewed)

    def test_scripts_have_no_cloud_write_methods_or_deploys(self):
        content = Path(cc.__file__).read_text()
        self.assertNotIn("method=\"POST\"", content)
        self.assertNotIn("method=\"PATCH\"", content)
        self.assertNotIn("method=\"PUT\"", content)
        self.assertNotIn("\"functions\", \"deploy\"", content)
        self.assertNotIn("\"firestore:rules\"", content)
        self.assertIn('"deploymentAuthorized": False', content)


if __name__ == "__main__":
    main()
