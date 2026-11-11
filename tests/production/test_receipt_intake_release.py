import os
from pathlib import Path
import unittest
from unittest.mock import patch

import receipt_intake_release as release


class ReleaseTest(unittest.TestCase):
    def test_unverified_staging_blocks_deploy(self):
        repo = "raulsandoval81-maker/SandmanSystem"
        env = {
            "GITHUB_REPOSITORY": repo,
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": f"{repo}/.github/workflows/production-receipt-intake-release.yml@refs/heads/main",
            "CONFIRM_PROJECT": release.PROJECT,
            "CONFIRM_SHA": release.PLAN["candidate"],
            "CONFIRM_RELEASE": "DEPLOY-RECEIPT-INTAKE-42924733167",
        }
        with patch.dict(os.environ, env, clear=True), patch.dict(
            release.PLAN, stagingAcceptance={"unpaidActivation": None, "combinedDelivery": None}
        ):
            release.guard("preflight")
            with self.assertRaisesRegex(RuntimeError, "staging evidence"):
                release.guard("deploy")

    def test_packages_match_inventory_and_load(self):
        root = Path(os.environ.get("RECEIPT_TEST_APPLICATION", "application"))
        for name in release.NAMES:
            with self.subTest(name=name):
                archive = release.package(name, root / "functions")
                files = release.archive_hashes(archive)
                self.assertIn("index.js", files)
                self.assertTrue(all(path.startswith("lib/") or path in
                                    {"index.js", "package.json", "package-lock.json"} for path in files))
                release.check_export(name, archive, root / "functions")
        self.assertEqual(len(release.assets(root)), 7)


if __name__ == "__main__":
    unittest.main()
