import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "deployment", Path(__file__).with_name("pr606-cash-check-deploy.py"))
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


class ReleaseTests(unittest.TestCase):
    def test_every_input_is_bound(self):
        env = {
            "GITHUB_REPOSITORY": deployment.inventory.REPO, "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": deployment.inventory.WORKFLOW, "REQUESTED_ACTION": deployment.ACTION,
            "CONFIRM_PROJECT": deployment.PROJECT, "CONFIRM_SHA": deployment.SHA,
            "DEPLOY_APPROVAL": deployment.APPROVAL,
            "EXPECTED_HOSTING_RELEASE": deployment.BASELINE["hosting"]["release"],
            "EXPECTED_HOSTING_VERSION": deployment.BASELINE["hosting"]["version"],
        }
        deployment.guard(env)
        for key in env:
            with self.subTest(key=key), self.assertRaisesRegex(RuntimeError, key):
                deployment.guard({**env, key: "invalid"})

    def test_exact_targets(self):
        self.assertEqual(deployment.FUNCTIONS, {
            "sendEnrollmentIntakeEmail": 1, "sendProposalPrepaidCashReceipt": 2,
            "recordManualEnrollmentIntakeDelivery": 1,
        })
        self.assertEqual(set(deployment.ENTRY_POINTS), set(deployment.FUNCTIONS))
        self.assertEqual(deployment.TARGET, "/intake-management/management.intake.js")
        with patch.object(deployment, "write") as write:
            with self.assertRaises(KeyError):
                deployment.source_update("unrelated", b"", "token")
            write.assert_not_called()

    def test_manifest_or_release_drift_fails_closed(self):
        with patch.dict(deployment.BASELINE, {"hosting": {
            "release": "approved", "version": "version",
            "fingerprint": deployment.fingerprint({"config": {}, "manifest": {"/path": "hash"}}),
        }}):
            baseline = {"release": "approved", "version": "version", "config": {}, "manifest": {"/path": "hash"}}
            deployment.verify_hosting_baseline(baseline)
            for key, value in (("release", "changed"), ("version", "changed"), ("config", {"x": 1}),
                               ("manifest", {"/path": "changed"})):
                with self.subTest(key=key), self.assertRaisesRegex(RuntimeError, "approved baseline"):
                    deployment.verify_hosting_baseline({**baseline, key: value})

    def test_gen1_source_patch_excludes_security_and_runtime(self):
        with patch.object(deployment, "write", side_effect=[
            {"uploadUrl": "https://storage.googleapis.com/path?signature=secret"},
            None, {"name": "operations/operation-1", "done": True},
        ]) as write:
            deployment.source_update("sendEnrollmentIntakeEmail", b"zip", "token")
        self.assertTrue(write.call_args.args[1].endswith("?updateMask=sourceUploadUrl"))
        self.assertEqual(set(write.call_args.args[3]), {"name", "sourceUploadUrl"})

    def test_gen2_source_patch_excludes_security_and_runtime(self):
        storage = {"bucket": "bucket", "object": "object", "generation": "1"}
        with patch.object(deployment, "write", side_effect=[
            {"uploadUrl": "https://storage.googleapis.com/path", "storageSource": storage},
            None, {"name": "projects/p/locations/us-central1/operations/op", "done": True},
        ]) as write:
            deployment.source_update("sendProposalPrepaidCashReceipt", b"zip", "token")
        self.assertTrue(write.call_args.args[1].endswith("?updateMask=buildConfig.source.storageSource"))
        self.assertEqual(write.call_args.args[3]["buildConfig"], {"source": {"storageSource": storage}})

    def test_unsafe_upload_does_not_patch_function(self):
        with patch.object(deployment, "write", return_value={"uploadUrl": "https://example.org"}) as write:
            with self.assertRaisesRegex(RuntimeError, "Unexpected upload host"):
                deployment.source_update("sendEnrollmentIntakeEmail", b"zip", "token")
        self.assertEqual(write.call_count, 1)


if __name__ == "__main__":
    unittest.main()
