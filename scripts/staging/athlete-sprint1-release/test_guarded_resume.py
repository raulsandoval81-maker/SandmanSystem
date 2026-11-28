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
                status = {"baseline": {}, "lastOperation": "before", "profileHandoffVerified": True}
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


    def test_full_practice_matrix_probes_both_accounts_without_live_snapshot(self):
        from types import SimpleNamespace
        with patch.dict(os.environ, self.valid_env(), clear=True), \
             patch.object(resume, "evidence_inputs", return_value=({}, {})), \
             patch.object(resume, "token", return_value="token"), \
             patch.object(resume, "permission_probe", side_effect=[
                 {"cloudfunctions.functions.create", "cloudfunctions.functions.sourceCodeSet"},
                 {"iam.serviceAccounts.actAs"}, {"iam.serviceAccounts.actAs"}
             ]) as probe:
            result = resume.preflight_practice()
        self.assertEqual(result["status"], "PASS_PRACTICE_CREATE_ONLY_PERMISSION_PREFLIGHT")
        self.assertFalse(result["deploymentAuthorized"])
        self.assertEqual(probe.call_count, 3)
        self.assertIn(resume.RUNTIME, probe.call_args_list[1].args[1])
        self.assertIn(resume.BUILDER, probe.call_args_list[2].args[1])

    def test_practice_permissions_fail_complete_without_grants(self):
        with patch.dict(os.environ, self.valid_env(), clear=True), \
             patch.object(resume, "evidence_inputs", return_value=({}, {})), \
             patch.object(resume, "token", return_value="token"), \
             patch.object(resume, "permission_probe", side_effect=[
                 {"cloudfunctions.functions.create"}, set(), set()
             ]) as probe:
            with self.assertRaisesRegex(RuntimeError, "cloudfunctions.functions.sourceCodeSet.*sandman-billing-runtime.*sandman-practice-build"):
                resume.preflight_practice()
        self.assertEqual(probe.call_count, 3)

    def test_create_only_refuses_unverified_handoff(self):
        with self.assertRaisesRegex(RuntimeError, "Same-run verified staging handoff"):
            resume.create_skills("token", Path("/not-present"), {"profileHandoffVerified": False})

    def test_cross_job_proof_must_be_same_run_same_project_and_same_sha(self):
        correct = {
            "status": "PASS_PROFILE_TRANSPORT",
            "project": resume.PROJECT,
            "sourceSha": resume.SOURCE_SHA,
            "runId": "test-run-471-new",
            "profileRedeployed": False,
            "deploymentAuthorized": True,
        }
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "receipt.json"
            env = {"GITHUB_RUN_ID": "test-run-471-new",
                   "SPRINT1_PROFILE_RECEIPT_JSON": str(p)}
            with patch.dict(os.environ, env, clear=True):
                p.write_text(json.dumps(correct))
                self.assertEqual(resume.stage_receipt("SPRINT1_PROFILE_RECEIPT_JSON", "PASS_PROFILE_TRANSPORT"), correct)
                for field, bad in (
                    ("status", "STOP_NO_RETRY"), ("project", "sandmandashboard"),
                    ("sourceSha", "bad"), ("runId", "unrelated-run"),
                    ("profileRedeployed", True), ("deploymentAuthorized", False)
                ):
                    candidate = {**correct, field: bad}
                    with self.subTest(field=field):
                        p.write_text(json.dumps(candidate))
                        with self.assertRaises(RuntimeError):
                            resume.stage_receipt("SPRINT1_PROFILE_RECEIPT_JSON", "PASS_PROFILE_TRANSPORT")

    def test_transport_role_split_is_source_constrained(self):
        import inspect
        stage = inspect.getsource(resume.execute_profile_transport)
        practice = inspect.getsource(resume.execute_create_skills)
        finish = inspect.getsource(resume.execute_skills_transport)
        self.assertNotIn("create_skills(", stage)
        self.assertNotIn("gcloud", practice)
        self.assertNotIn("create_skills(", finish)
        self.assertIn("stage_receipt", practice)
        self.assertIn("stage_receipt", finish)
        self.assertIn("preserve_inventory(baseline, t, True)", finish)
        self.assertIn("verify_unauthenticated_denial", finish)


if __name__ == "__main__":
    unittest.main()
