from copy import deepcopy
from contextlib import redirect_stdout
import io
import json
import os
import unittest
from unittest.mock import patch
import zipfile

import receipt_intake_release as release


REVISION = "saveproposalenrollmentagreement-00007-zuk"
SERVICE = "projects/sandmandashboard/locations/us-central1/services/saveproposalenrollmentagreement"
RESULT = {"sourceFilesMatch": True, "liveArchiveSha256": "a" * 64,
          "rollbackArchiveSha256": "b" * 64, "liveRuntimeSha256": "c" * 64,
          "runtimeMatches": False}


def snapshot():
    # Cloud Run v2 REST returns full resource paths for ready/created revisions,
    # a short revision ID for traffic status, and int64 generations as strings.
    return {
        "function": {"buildConfig": {"runtime": "nodejs22"},
                     "serviceConfig": {"environmentVariables": {"SECRET": "private-value"}}},
        "iam": {"version": 1, "etag": "function-etag", "bindings": [
            {"role": "roles/cloudfunctions.invoker", "members": ["user:private@example.invalid"]}]},
        "runIam": {"version": 1, "etag": "run-etag", "bindings": []},
        "run": {
            "name": SERVICE, "generation": "7", "observedGeneration": "7",
            "buildConfig": {}, "annotations": {},
            "latestReadyRevision": f"{SERVICE}/revisions/{REVISION}",
            "latestCreatedRevision": f"{SERVICE}/revisions/{REVISION}",
            "terminalCondition": {"type": "Ready", "state": "CONDITION_SUCCEEDED"},
            "traffic": [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", "percent": 100}],
            "trafficStatuses": [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
                                 "revision": REVISION, "percent": 100,
                                 "uri": "https://private.example.invalid"}],
            "template": {"labels": {}, "containers": [{"image": "candidate"}]},
        },
    }


def archive(body=b"restored"):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as package:
        package.writestr("index.js", body)
    return output.getvalue()


class RestorationEvidenceTest(unittest.TestCase):
    def test_only_hashes_and_verification_flags_are_logged(self):
        before = snapshot()
        out = io.StringIO()
        with redirect_stdout(out), patch.object(release, "config", return_value=before), \
                patch.object(release, "diagnose_release_10", return_value=RESULT) as diagnostic, \
                patch.object(release.release, "write") as write:
            release.capture_restoration_evidence("token", b"candidate")
        receipt = json.loads(out.getvalue())
        self.assertEqual(receipt, {**RESULT, "servingRevisionVerified": True,
                                  "configurationSha256": release.digest(release.inventory.sanitize(before))})
        diagnostic.assert_called_once_with("token", b"candidate", report=False)
        write.assert_not_called()
        for key in ("iam", "runIam"):
            altered = deepcopy(before)
            altered[key]["etag"] = "different"
            self.assertNotEqual(receipt["configurationSha256"],
                                release.digest(release.inventory.sanitize(altered)))

    def test_stale_wrong_or_split_cloud_run_response_is_rejected(self):
        for change in (
            {"observedGeneration": "6"},
            {"latestCreatedRevision": SERVICE + "/revisions/other"},
            {"latestReadyRevision": REVISION},
            {"reconciling": True},
            {"terminalCondition": {"state": "CONDITION_PENDING"}},
            {"trafficStatuses": [{"revision": REVISION, "percent": 99},
                                 {"revision": "old", "percent": 1}]},
        ):
            before = snapshot()
            before["run"].update(change)
            with self.subTest(change=change), patch.object(release, "config", return_value=before), \
                    patch.object(release, "diagnose_release_10") as diagnostic:
                with self.assertRaises(RuntimeError):
                    release.capture_restoration_evidence("token", b"candidate")
                diagnostic.assert_not_called()

    def test_iam_race_fails_without_emitting_a_receipt(self):
        before = snapshot()
        after = deepcopy(before)
        after["runIam"]["etag"] = "changed"
        out = io.StringIO()
        with redirect_stdout(out), patch.object(release, "config", side_effect=[before, after]), \
                patch.object(release, "diagnose_release_10", return_value=RESULT):
            with self.assertRaisesRegex(RuntimeError, "Configuration changed"):
                release.capture_restoration_evidence("token", b"candidate")
        self.assertEqual(out.getvalue(), "")


class SingleFunctionRestorationTest(unittest.TestCase):
    def setUp(self):
        self.before = snapshot()
        self.after = deepcopy(self.before)
        revision = "saveproposalenrollmentagreement-00008-test"
        path = f"{SERVICE}/revisions/{revision}"
        self.after["run"].update({
            "generation": "8", "observedGeneration": "8",
            "latestReadyRevision": path, "latestCreatedRevision": path,
            "trafficStatuses": [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
                                  "revision": revision, "percent": 100}],
        })
        self.rollback = archive()
        self.candidate = archive(b"candidate")
        self.restoration = {
            **release.RESTORATION,
            "configurationSha256": release.digest(release.inventory.sanitize(self.before)),
            "candidateArchiveSha256": "a" * 64,
            "rollbackArchiveSha256": release.inventory.sha(self.rollback),
        }
        self.expected = release.PLAN["functions"][release.RESTORE_NAME]
        self.plan_function = {
            **self.expected,
            "reference": {**self.expected["reference"],
                          "generation": release.RESTORATION["rollbackGeneration"]},
            "recoveryFilesSha256": release.digest(release.archive_hashes(self.rollback)),
        }

    def patches(self):
        return (
            patch.dict(release.RESTORATION, self.restoration, clear=True),
            patch.dict(release.PLAN["functions"], {release.RESTORE_NAME: self.plan_function}),
            patch.object(release, "diagnose_release_10", return_value={
                "sourceFilesMatch": True, "liveArchiveSha256": "a" * 64}),
            patch.object(release, "pinned_recovery", return_value=self.rollback),
            patch.object(release, "unrelated_state", return_value={"protected": True}),
            patch.object(release, "require_unrelated_unchanged"),
        )

    def test_successful_simulated_single_function_restoration(self):
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], contexts[5], \
                patch.object(release, "config", side_effect=[self.before, self.before, self.after]), \
                patch.object(release.release, "source_update") as update, \
                patch.object(release, "source", return_value=self.rollback), \
                redirect_stdout(io.StringIO()) as output:
            release.restore_single_function("token", self.candidate)
        update.assert_called_once_with(release.RESTORE_NAME, self.rollback, "token")
        receipt = json.loads(output.getvalue())
        self.assertEqual(receipt["function"], release.RESTORE_NAME)
        self.assertTrue(receipt["configurationProtected"])
        self.assertTrue(receipt["excludedResourcesUnchanged"])
        self.assertFalse(receipt["historicalRuntimeFingerprintMatches"])

    def test_incorrect_configuration_fingerprint_stops_before_write(self):
        with patch.object(release, "config", return_value=self.before), \
                patch.object(release.release, "source_update") as update:
            with self.assertRaisesRegex(RuntimeError, "configuration fingerprint"):
                release.restore_single_function("token", self.candidate)
        update.assert_not_called()

    def test_candidate_or_rollback_archive_mismatch_stops_before_write(self):
        for diagnostic, rollback in (
            ({"sourceFilesMatch": False, "liveArchiveSha256": "a" * 64}, self.rollback),
            ({"sourceFilesMatch": True, "liveArchiveSha256": "different"}, self.rollback),
            ({"sourceFilesMatch": True, "liveArchiveSha256": "a" * 64}, archive(b"wrong")),
        ):
            contexts = self.patches()
            with self.subTest(diagnostic=diagnostic), contexts[0], contexts[1], \
                    patch.object(release, "diagnose_release_10", return_value=diagnostic), \
                    patch.object(release, "pinned_recovery", return_value=rollback), \
                    patch.object(release, "config", return_value=self.before), \
                    patch.object(release.release, "source_update") as update:
                with self.assertRaises(RuntimeError):
                    release.restore_single_function("token", self.candidate)
                update.assert_not_called()

    def test_runtime_or_iam_drift_after_write_fails_closed(self):
        drifted = deepcopy(self.after)
        drifted["runIam"]["etag"] = "changed"
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], contexts[5], \
                patch.object(release, "config", side_effect=[self.before, self.before, drifted]), \
                patch.object(release.release, "source_update") as update:
            with self.assertRaisesRegex(RuntimeError, "runtime or IAM changed"):
                release.restore_single_function("token", self.candidate)
        update.assert_called_once()

    def test_split_or_stale_traffic_is_rejected(self):
        cases = [
            {"trafficStatuses": [{"revision": REVISION, "percent": 50},
                                 {"revision": "old", "percent": 50}]},
            {"latestCreatedRevision": f"{SERVICE}/revisions/old"},
            {"reconciling": True},
        ]
        for change in cases:
            value = snapshot()
            value["run"].update(change)
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                release.verify_healthy_serving(value, REVISION)

    def test_failed_or_uncertain_update_stops_without_retry(self):
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], contexts[5], \
                patch.object(release, "config", side_effect=[self.before, self.before]), \
                patch.object(release.release, "source_update", side_effect=RuntimeError("outcome unknown")) as update, \
                redirect_stdout(io.StringIO()) as output:
            with self.assertRaisesRegex(RuntimeError, "outcome unknown"):
                release.restore_single_function("token", self.candidate)
        update.assert_called_once()
        self.assertTrue(json.loads(output.getvalue())["STOP_NO_RETRY"])

    def test_unrelated_resource_change_fails_without_automatic_reverse(self):
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], \
                patch.object(release, "require_unrelated_unchanged",
                             side_effect=[None, RuntimeError("Excluded Functions changed")]), \
                patch.object(release, "config", side_effect=[self.before, self.before, self.after]), \
                patch.object(release.release, "source_update") as update, \
                patch.object(release, "source", return_value=self.rollback):
            with self.assertRaisesRegex(RuntimeError, "Excluded Functions"):
                release.restore_single_function("token", self.candidate)
        update.assert_called_once()

    def test_separate_owner_authorization_and_existing_guards(self):
        repo = "raulsandoval81-maker/SandmanSystem"
        base = {
            "GITHUB_REPOSITORY": repo, "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": f"{repo}/.github/workflows/production-receipt-intake-release.yml@refs/heads/main",
            "CONFIRM_PROJECT": release.PROJECT, "CONFIRM_SHA": release.PLAN["candidate"],
        }
        with patch.dict(os.environ, base, clear=True):
            with self.assertRaisesRegex(RuntimeError, "restoration confirmation"):
                release.guard("restore-save-proposal-agreement")
        with patch.dict(os.environ, {**base, "CONFIRM_RELEASE": release.RESTORE_CONFIRMATION}, clear=True):
            release.guard("restore-save-proposal-agreement")
        for mode, confirmation in (("deploy", "DEPLOY-RECEIPT-INTAKE-42924733167"),
                                   ("rollback", "ROLLBACK-RECEIPT-INTAKE-42924733167")):
            with patch.dict(os.environ, {**base, "CONFIRM_RELEASE": confirmation}, clear=True):
                if mode == "deploy":
                    with patch.dict(release.PLAN, pendingCoreFunctionBaseline=False):
                        release.guard(mode)
                else:
                    release.guard(mode)
        self.assertNotEqual(release.RESTORATION["capturedRuntimeSha256"],
                            release.PLAN["functions"][release.RESTORE_NAME]["runtimeSha256"])
        self.assertEqual(release.PLAN["functions"][release.RESTORE_NAME]["configurationSha256"],
                         "84087a4e1fb4edca2bff6a4e6d4c0d3753cc39cfd45aac1b68039b3c8d80ab50")
