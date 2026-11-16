"""Verify the protected staging preflight scope and write boundary."""
import importlib
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "scripts" / name) for name in ("production", "staging")]
handoff = importlib.import_module("staging-handoff-release")


class HandoffReleaseTests(unittest.TestCase):
    def setUp(self):
        self.before = {"function": {"state": "ACTIVE"}}
        self.after = {"function": {"state": "ACTIVE", "updateTime": "after"}}
        self.old_files = {"index.js": "old"}
        self.candidate_files = {"index.js": "candidate"}
        self.candidate_digest = handoff.release.digest(self.candidate_files)
        self.enterContext(patch.object(handoff, "FILES_SHA", self.candidate_digest))
        for module in (handoff.release, handoff.release.inventory, handoff.release.release):
            self.enterContext(patch.object(module, "PROJECT", module.PROJECT))
        self.config = self.enterContext(patch.object(handoff, "configuration",
            side_effect=[self.before, self.before]))
        self.enterContext(patch.object(handoff.release, "verify_function_healthy",
            return_value="before"))
        self.enterContext(patch.object(handoff.release, "source", return_value=b"old"))
        self.enterContext(patch.object(handoff.release, "archive_hashes",
            side_effect=lambda archive: self.old_files if archive == b"old" else self.candidate_files))
        self.update = self.enterContext(patch.object(handoff.release.release, "source_update"))
        self.enterContext(patch("builtins.print"))

    def test_guard_rejects_untrusted_dispatch_and_rerun(self):
        env = {
            "GITHUB_REPOSITORY": handoff.REPO,
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": f"{handoff.REPO}/.github/workflows/staging-exact-sha-release.yml@refs/heads/main",
            "GITHUB_RUN_ATTEMPT": "1",
        "HANDOFF_ACTION": "handoff-preflight",
            "CONFIRM_PROJECT": handoff.PROJECT,
            "CONFIRM_SHA": handoff.SHA,
        }
        handoff.guard(env)
        for key in env:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                handoff.guard({**env, key: "unexpected"})

    def test_preflight_does_not_write(self):
        handoff.run(b"candidate", "test-token")
        self.update.assert_not_called()

    def test_rejects_unapproved_package_before_cloud_reads(self):
        with self.assertRaisesRegex(RuntimeError, "file-set hash differs"):
            handoff.run(b"old", "test-token")
        self.config.assert_not_called()
        self.update.assert_not_called()

    def test_rejects_live_drift_before_write(self):
        self.config.side_effect = [self.before, self.after]
        with self.assertRaisesRegex(RuntimeError, "drifted during capture"):
            handoff.run(b"candidate", "test-token")
        self.update.assert_not_called()

    def test_rejects_duplicate_source(self):
        self.old_files = self.candidate_files
        with self.assertRaisesRegex(RuntimeError, "already serves"):
            handoff.run(b"candidate", "test-token")
        self.update.assert_not_called()
