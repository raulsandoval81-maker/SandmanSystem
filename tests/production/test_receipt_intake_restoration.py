from copy import deepcopy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import receipt_intake_release as release


class RestorationEvidenceTest(unittest.TestCase):
    def snapshot(self):
        revision = "saveproposalenrollmentagreement-00007-zuk"
        return {
            "function": {"serviceConfig": {"environmentVariables": {"SECRET": "private"}}},
            "iam": {"bindings": []},
            "runIam": {"bindings": []},
            "run": {"latestReadyRevision": "service/revisions/" + revision,
                    "reconciling": False, "terminalCondition": {"state": "CONDITION_SUCCEEDED"},
                    "trafficStatuses": [{"revision": revision, "percent": 100}]},
        }

    def test_capture_redacts_values_and_never_writes_to_cloud(self):
        snapshot = self.snapshot()
        with tempfile.TemporaryDirectory() as tmp, patch.object(release, "Path",
                side_effect=lambda path: Path(tmp) / path), patch.object(release, "config",
                return_value=snapshot), patch.object(release, "diagnose_release_10") as diagnostic, \
                patch.object(release.release, "source_update") as update:
            release.capture_restoration_evidence("token", b"candidate")
            body = (Path(tmp) / "recovery-evidence/saveProposalEnrollmentAgreement.json").read_text()
            self.assertNotIn("private", body)
            self.assertIn('"iam"', body)
            self.assertIn('"runIam"', body)
            diagnostic.assert_called_once()
            update.assert_not_called()

    def test_split_traffic_and_configuration_race_fail_closed(self):
        snapshot = self.snapshot()
        split = deepcopy(snapshot)
        split["run"]["trafficStatuses"][0]["percent"] = 50
        with patch.object(release, "config", return_value=split), \
                patch.object(release, "diagnose_release_10") as diagnostic:
            with self.assertRaisesRegex(RuntimeError, "Unexpected serving traffic"):
                release.capture_restoration_evidence("token", b"candidate")
            diagnostic.assert_not_called()
        with patch.object(release, "config", side_effect=[snapshot, split]), \
                patch.object(release, "diagnose_release_10"):
            with self.assertRaisesRegex(RuntimeError, "Configuration changed"):
                release.capture_restoration_evidence("token", b"candidate")
