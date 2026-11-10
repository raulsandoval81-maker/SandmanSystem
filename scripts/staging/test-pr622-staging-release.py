import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "pr622", Path(__file__).with_name("pr622-staging-release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseGuards(unittest.TestCase):
    def setUp(self):
        self.env = {
            "GITHUB_REPOSITORY": release.inventory.REPO,
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": release.inventory.WORKFLOW,
            "CONFIRM_PROJECT": release.PROJECT,
            "CONFIRM_SHA": release.SHA,
            "REQUESTED_ACTION": release.PREFLIGHT,
        }

    def test_readonly_and_write_guards(self):
        release.guard(self.env)
        for key in self.env:
            with self.subTest(key=key), self.assertRaisesRegex(RuntimeError, key):
                release.guard({**self.env, key: "other"})
        self.env["REQUESTED_ACTION"] = release.DEPLOY
        with self.assertRaisesRegex(RuntimeError, "deployment approval"):
            release.guard(self.env)
        self.env["DEPLOY_APPROVAL"] = release.APPROVAL
        with self.assertRaisesRegex(RuntimeError, "preflight SHA-256"):
            release.guard(self.env)
        self.env["EXPECTED_BASELINE_SHA256"] = "a" * 64
        release.guard(self.env)

    def test_manifest_matches_git(self):
        self.assertEqual(set(release.offline()), release.MANIFEST)
        self.assertEqual(len(release.MANIFEST), 13)

    def test_baseline_and_scope_must_match(self):
        evidence = {"project": release.PROJECT, "applicationSha": release.SHA, "errors": [],
                    "functions": dict.fromkeys(release.ENTRY_POINTS),
                    "hostingRollback": {"changedPaths": list(release.ASSETS)}}
        with patch.dict(os.environ, {"EXPECTED_BASELINE_SHA256": "a" * 64}):
            self.assertEqual(release.check_baseline(evidence, "a" * 64), evidence["hostingRollback"])
            with self.assertRaisesRegex(RuntimeError, "baseline changed"):
                release.check_baseline(evidence, "b" * 64)
            with self.assertRaisesRegex(RuntimeError, "Preflight did not pass"):
                release.check_baseline({**evidence, "functions": {"unexpected": None}}, "a" * 64)
            with self.assertRaisesRegex(RuntimeError, "Hosting scope"):
                release.check_baseline({**evidence, "hostingRollback": {"changedPaths": []}}, "a" * 64)

    def test_release_scope_has_no_rules_or_extra_function(self):
        with patch.dict(os.environ, self.env):
            release.bind_scope()
        self.assertEqual(set(release.release.FUNCTIONS), set(release.ENTRY_POINTS))
        self.assertEqual(len(release.release.FUNCTIONS), 4)
        self.assertEqual(len(release.original.ASSETS), 5)
        self.assertNotIn("rules", release.preflight.REQUIREMENTS)


if __name__ == "__main__":
    unittest.main()
