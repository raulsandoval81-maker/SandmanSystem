from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/production"))
import management_xp_release as release


class ManagementXpReleaseTest(unittest.TestCase):
    def test_verify_only_checks_preflight_without_upload_or_release(self):
        with patch.object(release.xp, "require_workflow_scope") as scope, \
                patch.dict(release.os.environ, {"DEPLOYMENT_APPROVAL": release.APPROVAL}), \
                patch.object(release.xp, "preflight") as preflight, \
                patch.object(release, "release") as deploy, \
                patch.object(release, "request") as upload:
            release.execute("VERIFY_ONLY", Path("application"))
            scope.assert_called_once_with(release.WORKFLOW)
            preflight.assert_called_once_with(Path("application"), release.WORKFLOW)
            deploy.assert_not_called()
            upload.assert_not_called()

    def test_unknown_mode_stops_before_any_production_calls(self):
        with patch.object(release.xp, "preflight") as preflight, \
                patch.object(release, "release") as deploy, \
                self.assertRaisesRegex(RuntimeError, "Invalid XP release mode"):
            release.execute("unexpected", Path("application"))
            preflight.assert_not_called()
            deploy.assert_not_called()

    def test_deploy_mode_is_separate_from_read_only(self):
        with patch.object(release, "release") as deploy, \
                patch.object(release.xp, "preflight") as preflight:
            release.execute("DEPLOY", Path("application"))
            deploy.assert_called_once_with(Path("application"))
            preflight.assert_not_called()

    def test_new_build_missing_source_can_use_verified_function_control_plane(self):
        source = dict(release.xp.ORIGINAL_SOURCE)
        resource = "projects/sandmandashboard/locations/us-central1/builds/build-new"
        config = {
            "build": resource,
            "sourceProvenance": {"resolvedStorageSource": source},
        }
        with patch.object(release.xp, "source_ref", wraps=release.xp.source_ref), \
                patch("sys.stdout") as output:
            release.verify_new_build_source(config, {"status": "SUCCESS"},
                                            resource, source)
            self.assertTrue(output.write.called)

    def test_new_build_rejects_conflicting_source_or_wrong_build_id(self):
        source = dict(release.xp.ORIGINAL_SOURCE)
        resource = "projects/sandmandashboard/locations/us-central1/builds/build-new"
        config = {"build": resource, "sourceProvenance": {"resolvedStorageSource": source}}
        with self.assertRaisesRegex(RuntimeError, "resource identity drift"):
            release.verify_new_build_source({**config, "build": "wrong"},
                                            {"status": "SUCCESS"}, resource, source)
        with self.assertRaisesRegex(RuntimeError, "source differs"):
            release.verify_new_build_source(config, {"status": "SUCCESS",
                "source": {"storageSource": {**source, "generation": "1"}}}, resource, source)
        with self.assertRaisesRegex(RuntimeError, "did not succeed"):
            release.verify_new_build_source(config, {"status": "FAILURE"}, resource, source)

    def test_wrong_approval_stops_before_production(self):
        with patch.object(release.xp, "require_workflow_scope"), patch.dict(
            release.os.environ, {"DEPLOYMENT_APPROVAL": "wrong"}
        ), patch.object(release.xp, "preflight") as preflight:
            with self.assertRaisesRegex(RuntimeError, "Missing exact deployment approval"):
                release.release(Path("application"))
            preflight.assert_not_called()

    def test_unverified_provenance_stops_before_upload_or_patch(self):
        with patch.object(release.xp, "require_workflow_scope"), patch.dict(
            release.os.environ, {"DEPLOYMENT_APPROVAL": release.APPROVAL}
        ), patch.object(release.xp, "preflight", side_effect=RuntimeError("UNVERIFIED")), patch.object(
            release, "request"
        ) as request:
            with self.assertRaisesRegex(RuntimeError, "UNVERIFIED"):
                release.release(Path("application"))
            request.assert_not_called()

    def test_upload_must_match_the_generation_pinned_storage_source(self):
        source = {"bucket": "gcf-test", "object": "candidate.zip", "generation": "182522"}
        self.assertEqual(release.upload_target({
            "uploadUrl": "https://storage.googleapis.com/gcf-test/candidate.zip?signature=dummy",
            "storageSource": source,
        }), source)
        for url in (
            "https://example.org/gcf-test/candidate.zip",
            "https://storage.googleapis.com/gcf-test/another.zip",
        ):
            with self.subTest(url=url), self.assertRaises(RuntimeError):
                release.upload_target({"uploadUrl": url, "storageSource": source})
        with self.assertRaisesRegex(RuntimeError, "immutable source"):
            release.upload_target({
                "uploadUrl": "https://storage.googleapis.com/gcf-test/candidate.zip",
                "storageSource": {**source, "generation": "0"},
            })

    def test_only_literal_xp_endpoint_can_receive_the_patch(self):
        baseline = {"function": {"buildConfig": {}, "serviceConfig": {}},
                    "run": {"template": {"containers": []}}, "functionIam": {}, "runIam": {}}
        package = b"fixture"
        with patch.object(release.xp, "require_workflow_scope"), patch.dict(
            release.os.environ, {"DEPLOYMENT_APPROVAL": release.APPROVAL}
        ), patch.object(release.xp, "preflight", return_value=(
            "token", lambda: baseline, baseline, release.BEFORE_REVISION, release.BEFORE_IMAGE, package
        )), patch.object(release.xp, "CANDIDATE_SHA256", release.xp.sha(package)), patch.object(
            release, "request"
        ), patch.object(release, "json_request", side_effect=[
            {"uploadUrl": "https://storage.googleapis.com/bucket/candidate.zip",
             "storageSource": {"bucket": "bucket", "object": "candidate.zip", "generation": "182522"}},
            RuntimeError("mock stop after observing the request"),
        ]) as api:
            with self.assertRaisesRegex(RuntimeError, "mock stop"):
                release.release(Path("application"))
            _, url, method, _, payload = api.call_args.args
            self.assertEqual(method, "PATCH")
            self.assertEqual(url, "https://cloudfunctions.googleapis.com/v2/projects/sandmandashboard/"
                             "locations/us-central1/functions/createManagementXpAdjustment"
                             "?updateMask=buildConfig.source.storageSource,buildConfig.environmentVariables")
            self.assertEqual(payload["name"], "projects/sandmandashboard/locations/us-central1/functions/"
                             "createManagementXpAdjustment")
            self.assertEqual(set(payload), {"name", "buildConfig"})
            self.assertEqual(payload["buildConfig"]["environmentVariables"], {"GOOGLE_NODE_RUN_SCRIPTS": ""})
