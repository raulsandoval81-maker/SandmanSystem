import io
import json
import os
import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

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
            with self.assertRaisesRegex(RuntimeError, "staging evidence|preflight-only"):
                release.guard("deploy")

    def test_storage_error_categories_do_not_emit_provider_text(self):
        for message, category in [
            ("account@private.example lacks storage.objects.get", "storage.objects.get denied"),
            ("Requester Pays bucket but no user project", "Requester Pays"),
            ("Request prohibited by organization's policy", "organization perimeter"),
            ("Request had insufficient authentication scopes", "insufficient token scope"),
            ("Unknown error with private detail", ""),
        ]:
            body = io.BytesIO(json.dumps({"error": {"message": message}}).encode())
            result = release.inventory.storage_error_detail(body)
            if category:
                self.assertIn(category, result)
                self.assertNotIn(message, result)
            else:
                self.assertEqual(result, "")

    def test_actions_credential_override_works_with_empty_gcloud_account_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            credentials = Path(tmp) / "gha-creds.json"
            credentials.write_text(json.dumps({
                "type": "service_account",
                "project_id": release.PROJECT,
                "client_email": "github-action-1258739245@sandmandashboard.iam.gserviceaccount.com",
            }))
            # Auth action credentials are not necessarily registered by 'gcloud auth list'.
            env = {"CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE": str(credentials)}
            with patch.object(release.subprocess, "check_output", return_value="test-token\n") as check:
                self.assertEqual(release.authenticated_release_token(env), "test-token")
            check.assert_called_once_with(
                ["gcloud", "auth", "print-access-token"], text=True
            )

    def test_wrong_or_missing_actions_identity_fails_before_token_request(self):
        with tempfile.TemporaryDirectory() as tmp:
            credentials = Path(tmp) / "gha-creds.json"
            credentials.write_text(json.dumps({
                "type": "service_account",
                "project_id": release.PROJECT,
                "client_email": "wrong-service-account@example.invalid",
            }))
            with patch.object(release.subprocess, "check_output") as check:
                with self.assertRaisesRegex(RuntimeError, "credential identity"):
                    release.authenticated_release_token({
                        "GOOGLE_APPLICATION_CREDENTIALS": str(credentials)
                    })
                with self.assertRaisesRegex(RuntimeError, "override missing"):
                    release.authenticated_release_token({})
            check.assert_not_called()

    def test_preflight_checks_every_archive_and_fails_closed(self):
        snapshots = {name: {} for name in release.NAMES}
        pinned = Mock(side_effect=[RuntimeError("HTTP 403"), *([b"zip"] * (len(snapshots) - 1))])
        with patch.object(release, "pinned_recovery", pinned), patch.object(release, "config", return_value={}):
            with self.assertRaisesRegex(RuntimeError, release.NAMES[0]):
                release.capture_recovery(snapshots, "test-token", report_all=True)
        self.assertEqual([call.args[0] for call in pinned.call_args_list], release.NAMES)

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
        self.assertEqual(len(release.assets(root)), 11 if release.PROFILE == "management-promotion" else 7)

    def test_management_candidate_cannot_run_deploy_or_rollback(self):
        repo = "raulsandoval81-maker/SandmanSystem"
        env = {
            "GITHUB_REPOSITORY": repo, "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": f"{repo}/.github/workflows/production-receipt-intake-release.yml@refs/heads/main",
            "CONFIRM_PROJECT": release.PROJECT, "CONFIRM_SHA": release.PLAN["candidate"],
        }
        with patch.dict(os.environ, env, clear=True), patch.object(release, "PROFILE", "management-promotion"):
            release.guard("preflight")
            for mode in ("deploy", "rollback"):
                with self.assertRaisesRegex(RuntimeError, "preflight-only"):
                    release.guard(mode)


if __name__ == "__main__":
    unittest.main()
