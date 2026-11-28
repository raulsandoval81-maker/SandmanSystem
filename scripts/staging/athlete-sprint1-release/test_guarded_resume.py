"""No-cloud safety tests for guarded Sprint 1 partial resume."""
import copy
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

import guarded_resume as resume


class GuardedResumeTests(unittest.TestCase):
    def valid_env(self):
        return {
            "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_WORKFLOW_REF": resume.WORKFLOW,
            "GITHUB_RUN_ATTEMPT": "1",
            "SPRINT1_ACTION": resume.ACTION,
            "CONFIRM_PROJECT": resume.PROJECT,
            "SPRINT1_APPROVAL": "APPROVE_SPRINT1_PARTIAL_RESUME_STAGING_ONLY",
            "SPRINT1_TRANSPORT_APPROVAL": "APPROVE_STAGING_APPLICATION_AUTH_TRANSPORT",
        }

    def test_untrusted_dispatch_fails_closed(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                resume.guard("preflight")
        for bad in ("GITHUB_REF", "GITHUB_WORKFLOW_REF", "GITHUB_RUN_ATTEMPT",
                    "SPRINT1_ACTION", "CONFIRM_PROJECT"):
            env = self.valid_env()
            env[bad] = "untrusted"
            with self.subTest(bad=bad), patch.dict(os.environ, env, clear=True):
                with self.assertRaises(RuntimeError):
                    resume.guard("execute")

    def test_separate_release_and_transport_approval_required(self):
        for bad in ("SPRINT1_APPROVAL", "SPRINT1_TRANSPORT_APPROVAL"):
            env = self.valid_env()
            env[bad] = ""
            with self.subTest(bad=bad), patch.dict(os.environ, env, clear=True):
                with self.assertRaises(RuntimeError):
                    resume.guard("execute")
        with patch.dict(os.environ, self.valid_env(), clear=True):
            resume.guard("execute")

    def test_staging_scope_and_post_only_create(self):
        with self.assertRaises(RuntimeError):
            resume.request("token", "https://cloudfunctions.googleapis.com/v2/projects/production/locations/us-central1/functions", "POST", {})
        with self.assertRaises(RuntimeError):
            resume.request("token", "https://run.googleapis.com/v2/projects/production/locations/us-central1/services", "GET")
        # The create-only function uses POST to the collection, never PATCH existing.
        with patch.object(resume, "preserve_inventory", return_value={resume.PROFILE_ID: {}}), \
             patch.object(resume, "package_zip", return_value=b"zip"), \
             patch.object(resume, "request") as req, \
             patch.object(resume, "save"):
            req.side_effect = [
                {"uploadUrl": "https://storage.googleapis.com/signed-upload",
                 "storageSource": {"bucket": "signed-staging-source", "object": "source.zip"}},
                {"name": resume.PARENT + "/operations/safe1"},
                {"done": True, "response": {"name": resume.SKILLS_ID}},
            ]
            class Reply:
                status = 200
                def __enter__(self):
                    return self
                def __exit__(self, *args):
                    pass
            with patch("urllib.request.urlopen", return_value=Reply()):
                status = {"baseline": {}, "lastOperation": "before"}
                with tempfile.TemporaryDirectory() as d:
                    resume.create_skills("token", Path(d), status)
            create = req.call_args_list[1]
            self.assertEqual(create.args[2], "POST")
            self.assertIn("functionId=getAthleteSkillsSummary", create.args[1])
            payload = create.args[3]
            self.assertEqual(payload["name"], resume.SKILLS_ID)
            self.assertEqual(payload["buildConfig"]["entryPoint"], resume.SKILLS)
            self.assertEqual(payload["serviceConfig"]["serviceAccountEmail"], resume.RUNTIME)
            self.assertNotIn("eventTrigger", payload)
            self.assertEqual(req.call_count, 3)

    def test_package_file_allowlist_rejects_unexpected_file(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "secret.env").write_text("do not package")
            with self.assertRaises(RuntimeError):
                resume.package_zip(root)

    def test_missing_invoker_field_equals_iam_check_enabled(self):
        service = {"name": f"{resume.PARENT}/services/{resume.PROFILE.lower()}"}
        with patch.object(resume, "request", return_value=service):
            self.assertTrue(resume.validate_transport("token", resume.PROFILE, False))
            with self.assertRaises(RuntimeError):
                resume.validate_transport("token", resume.PROFILE, True)

    def test_unauthenticated_success_is_rejected(self):
        class Success:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
        with patch("urllib.request.urlopen", return_value=Success()):
            with self.assertRaises(RuntimeError):
                resume.verify_unauthenticated_denial(resume.PROFILE)

    def test_unauthenticated_403_without_app_denial_is_rejected(self):
        error = urllib.error.HTTPError("https://test", 403, "Forbidden", {}, io.BytesIO(b"Forbidden"))
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaises(RuntimeError):
                resume.verify_unauthenticated_denial(resume.SKILLS)

    def test_unauthenticated_401_with_expected_app_denial_passes(self):
        error = urllib.error.HTTPError("https://test", 401, "Forbidden", {},
                                      io.BytesIO(b'{"error":{"status":"UNAUTHENTICATED"}}'))
        with patch("urllib.request.urlopen", side_effect=error):
            resume.verify_unauthenticated_denial(resume.PROFILE)

    def test_permission_probe_requires_exact_staging_targets(self):
        with self.assertRaises(RuntimeError):
            resume.permission_probe("token", "https://iam.googleapis.com/v1/projects/-/serviceAccounts/production@other.iam.gserviceaccount.com:testIamPermissions", {"iam.serviceAccounts.actAs"})

    def test_source_archiver_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "index.cjs").write_text("safe")
            (root / "link").symlink_to(root / "index.cjs")
            with self.assertRaises(RuntimeError):
                resume.package_zip(root)

    def test_release_manifest_never_self_authorizes(self):
        m = json.loads((resume.HERE / "release-manifest.json").read_text())
        self.assertFalse(m["productionAuthorized"])
        self.assertFalse(m["deploymentAuthorized"])
        self.assertEqual(m["sourceSha"], resume.SOURCE_SHA)
        self.assertEqual([i["name"] for i in m["functions"]], [resume.PROFILE, resume.SKILLS])


if __name__ == "__main__":
    unittest.main()
