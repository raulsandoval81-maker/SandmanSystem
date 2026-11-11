"""Regression checks for the exact PR #632 staging release boundary."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "pr632", Path(__file__).with_name("pr632-staging-release.py")
)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def environment(action):
    return {
        "REQUESTED_ACTION": action,
        "GITHUB_REPOSITORY": release.inventory.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": release.inventory.WORKFLOW,
        "CONFIRM_PROJECT": release.inventory.PROJECT,
        "CONFIRM_SHA": release.SHA,
    }


class ReleaseTest(unittest.TestCase):
    def test_deployment_requires_distinct_approval_and_digest(self):
        env = environment(release.DEPLOY)
        with self.assertRaisesRegex(RuntimeError, "deployment approval"):
            release.guard(env)
        env["DEPLOY_APPROVAL"] = release.APPROVAL
        with self.assertRaisesRegex(RuntimeError, "preflight SHA-256"):
            release.guard(env)
        env["EXPECTED_BASELINE_SHA256"] = "a" * 64
        release.guard(env)
        for key in ("CONFIRM_PROJECT", "CONFIRM_SHA", "GITHUB_REF", "GITHUB_WORKFLOW_REF"):
            with self.subTest(key=key), self.assertRaisesRegex(RuntimeError, key):
                release.guard({**env, key: "wrong"})

    def test_wrapper_installs_guard_offline_and_scope_before_inherited_main(self):
        # Regression for failed runs #43053811107 and #43055224672.
        engine = release.protected
        with (patch.dict(os.environ, environment(release.PREFLIGHT)),
              patch.object(engine, "guard"),
              patch.object(engine, "offline"),
              patch.object(engine, "bind_scope"),
              patch.object(engine, "main") as inherited):
            def validate_dispatch():
                self.assertIs(engine.guard, release.guard)
                self.assertIs(engine.offline, release.offline)
                self.assertIs(engine.bind_scope, release.bind_scope)
                engine.guard(os.environ)
            inherited.side_effect = validate_dispatch
            release.run_release()
            inherited.assert_called_once_with()

    def test_readonly_preflight_does_not_reach_write_path(self):
        engine = release.protected
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, environment(release.PREFLIGHT)), \
                patch.object(engine, "EVIDENCE", Path(directory) / "baseline.json"), \
                patch.object(engine, "PREFLIGHT", release.PREFLIGHT), \
                patch.object(engine, "guard", release.guard), patch.object(engine, "offline"), \
                patch.object(engine, "bind_scope"), patch.object(engine.original, "prepare_hosting") as prepare, \
                patch.object(engine.release, "source_update") as update:
            def live(*, include_rules, output):
                self.assertFalse(include_rules)
                output.write_text("{}")
                return 0
            with patch.object(engine.preflight, "live", side_effect=live):
                engine.main()
            prepare.assert_not_called()
            update.assert_not_called()


if __name__ == "__main__":
    unittest.main()
