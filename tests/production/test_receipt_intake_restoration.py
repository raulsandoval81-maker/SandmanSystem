from copy import deepcopy
from contextlib import redirect_stdout
import io
import json
import unittest
from unittest.mock import patch

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
        "function": {"serviceConfig": {"environmentVariables": {"SECRET": "private-value"}}},
        "iam": {"version": 1, "etag": "function-etag", "bindings": [
            {"role": "roles/cloudfunctions.invoker", "members": ["user:private@example.invalid"]}]},
        "runIam": {"version": 1, "etag": "run-etag", "bindings": []},
        "run": {
            "name": SERVICE, "generation": "7", "observedGeneration": "7",
            "latestReadyRevision": f"{SERVICE}/revisions/{REVISION}",
            "latestCreatedRevision": f"{SERVICE}/revisions/{REVISION}",
            "terminalCondition": {"type": "Ready", "state": "CONDITION_SUCCEEDED"},
            "traffic": [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", "percent": 100}],
            "trafficStatuses": [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
                                 "revision": REVISION, "percent": 100,
                                 "uri": "https://private.example.invalid"}],
        },
    }


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
