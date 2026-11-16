"""Verify the protected staging preflight scope and write boundary."""
import importlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

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
        handoff.run(b"candidate", "test-token", "handoff-preflight")
        self.update.assert_not_called()

    def test_rejects_unapproved_package_before_cloud_reads(self):
        with self.assertRaisesRegex(RuntimeError, "file-set hash differs"):
            handoff.run(b"old", "test-token", "handoff-preflight")
        self.config.assert_not_called()
        self.update.assert_not_called()

    def test_rejects_live_drift_before_write(self):
        self.config.side_effect = [self.before, self.after]
        with self.assertRaisesRegex(RuntimeError, "drifted during capture"):
            handoff.run(b"candidate", "test-token", "handoff-preflight")
        self.update.assert_not_called()

    def test_rejects_duplicate_source(self):
        self.old_files = self.candidate_files
        with self.assertRaisesRegex(RuntimeError, "already serves"):
            handoff.run(b"candidate", "test-token", "handoff-preflight")
        self.update.assert_not_called()


    def approved_baseline(self):
        return handoff.release.digest({
            "snapshot": self.before,
            "recoveryFilesSha256": handoff.release.digest(self.old_files),
            "candidateFilesSha256": self.candidate_digest,
        })

    def test_deploy_rejects_baseline_mismatch(self):
        with self.assertRaisesRegex(RuntimeError, "differs from approved preflight"):
            handoff.run(b"candidate", "test-token", "handoff-deploy")
        self.update.assert_not_called()

    def test_deploy_rejects_drift_after_baseline_match(self):
        self.config.side_effect = [self.before, self.after]
        with patch.object(handoff, "BASELINE_SHA", self.approved_baseline()):
            with self.assertRaisesRegex(RuntimeError, "drifted during capture"):
                handoff.run(b"candidate", "test-token", "handoff-deploy")
        self.update.assert_not_called()

    def test_deploy_updates_only_target_and_verifies_serving_source(self):
        self.config.side_effect = [self.before, self.before, self.after, self.after]
        with (
            patch.object(handoff, "BASELINE_SHA", self.approved_baseline()),
            patch.object(handoff.release, "verify_function_healthy", side_effect=["before", "after"]),
            patch.object(handoff.release, "verify_updated_runtime") as verify_runtime,
            patch.object(handoff.release, "source", side_effect=[b"old", b"candidate"]) as source,
        ):
            handoff.run(b"candidate", "test-token", "handoff-deploy")
        self.update.assert_called_once_with(handoff.NAME, b"candidate", "test-token")
        verify_runtime.assert_called_once_with(handoff.NAME, self.before, self.after)
        source.assert_called_with(handoff.NAME, self.after, "test-token")

    def test_deploy_stops_on_unexpected_serving_source(self):
        self.config.side_effect = [self.before, self.before, self.after]
        with (
            patch.object(handoff, "BASELINE_SHA", self.approved_baseline()),
            patch.object(handoff.release, "verify_function_healthy", side_effect=["before", "after"]),
            patch.object(handoff.release, "verify_updated_runtime"),
        ):
            with self.assertRaisesRegex(RuntimeError, "Serving staging source differs"):
                handoff.run(b"candidate", "test-token", "handoff-deploy")
        self.update.assert_called_once()


class ExportVerificationTests(unittest.TestCase):
    def test_export_check_isolates_credentials_and_rejects_wrong_exports(self):
        good = (
            "if (process.env.GOOGLE_APPLICATION_CREDENTIALS || "
            "require('node:fs').existsSync(require('node:os').homedir() + "
            "'/.config/gcloud/application_default_credentials.json')) process.exit(2);"
            "exports.issueProposalEnrollmentHandoff = () => {};"
        )
        with tempfile.TemporaryDirectory() as directory:
            auth = Path(directory) / ".config/gcloud/application_default_credentials.json"
            auth.parent.mkdir(parents=True)
            auth.write_text('{"type":"external_account"}')
            with patch.dict(os.environ, {"HOME": directory, "GOOGLE_APPLICATION_CREDENTIALS": str(auth)}):
                for code, valid in (
                    (good, True),
                    (good + "exports.extra = () => {};", False),
                    ("exports.issueProposalEnrollmentHandoff = 42;", False),
                ):
                    with self.subTest(code=code):
                        archive = io.BytesIO()
                        with zipfile.ZipFile(archive, "w") as package:
                            package.writestr("index.js", code)
                        if valid:
                            handoff.release.check_export(handoff.NAME, archive.getvalue(), Path(directory))
                        else:
                            with self.assertRaises(subprocess.CalledProcessError) as failure:
                                handoff.release.check_export(handoff.NAME, archive.getvalue(), Path(directory))
                            self.assertEqual(failure.exception.returncode, 1)
                self.assertEqual(os.environ["GOOGLE_APPLICATION_CREDENTIALS"], str(auth))
