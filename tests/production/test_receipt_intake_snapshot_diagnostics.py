"""Offline tests: retain strict drift detection while revealing safe field paths."""
import unittest
from copy import deepcopy

import receipt_intake_release as release


class SnapshotDiagnosticsTest(unittest.TestCase):
    def setUp(self):
        self.snapshot = {
            "function": {
                "name": "projects/sandmandashboard/locations/us-central1/functions/saveProposalEnrollmentAgreement",
                "buildConfig": {"sourceProvenance": {"resolvedStorageSource": {
                    "bucket": "test-bucket", "object": "source.zip", "generation": "123"
                }}},
                "serviceConfig": {"environmentVariables": {"API_KEY": "keep-private"}}
            },
            "iam": {"etag": "etag1", "bindings": [{"role": "roles/cloudfunctions.invoker",
                      "members": ["user:private@example.invalid"]}]},
            "run": {"generation": "7", "observedGeneration": "7",
                    "trafficStatuses": [{"percent": 100, "revision": "revision-1"}]},
            "runIam": {"etag": "run-etag1"}
        }

    def test_unchanged_snapshot_passes(self):
        release.require_snapshot_unchanged(self.snapshot, deepcopy(self.snapshot), "drift")

    def test_metadata_field_change_fails_and_identifies_exact_path(self):
        changed = deepcopy(self.snapshot)
        changed["run"]["observedGeneration"] = "8"
        with self.assertRaisesRegex(RuntimeError, r"run.observedGeneration"):
            release.require_snapshot_unchanged(self.snapshot, changed, "Function changed during diagnostics")

    def test_source_generation_drift_is_not_normalized(self):
        changed = deepcopy(self.snapshot)
        changed["function"]["buildConfig"]["sourceProvenance"]["resolvedStorageSource"]["generation"] = "124"
        with self.assertRaisesRegex(RuntimeError, "resolvedStorageSource.generation"):
            release.require_snapshot_unchanged(self.snapshot, changed, "drift")

    def test_iam_etag_and_traffic_drift_still_fail(self):
        for section, key, value, field in (
            ("iam", "etag", "etag2", "iam.etag"),
            ("runIam", "etag", "run-etag2", "runIam.etag"),
            ("run", "generation", "8", "run.generation")
        ):
            changed = deepcopy(self.snapshot)
            changed[section][key] = value
            with self.subTest(field=field), self.assertRaisesRegex(RuntimeError, field):
                release.require_snapshot_unchanged(self.snapshot, changed, "drift")
        changed = deepcopy(self.snapshot)
        changed["run"]["trafficStatuses"][0]["percent"] = 50
        with self.assertRaisesRegex(RuntimeError, r"run.trafficStatuses\[0\].percent"):
            release.require_snapshot_unchanged(self.snapshot, changed, "drift")

    def test_sensitive_values_and_environment_names_are_never_logged(self):
        changed = deepcopy(self.snapshot)
        changed["function"]["serviceConfig"]["environmentVariables"]["API_KEY"] = "new-private"
        changed["iam"]["bindings"][0]["members"] = ["user:another-private@example.invalid"]
        try:
            release.require_snapshot_unchanged(self.snapshot, changed, "drift")
        except RuntimeError as error:
            message = str(error)
            self.assertIn("environmentVariables.<redacted>", message)
            self.assertIn("members.<redacted>", message)
            for secret in ("API_KEY", "new-private", "keep-private", "private@example.invalid",
                           "another-private@example.invalid"):
                self.assertNotIn(secret, message)
        else:
            self.fail("Drift was wrongly accepted")

    def test_key_addition_removal_and_type_change_fail(self):
        for change in ("addition", "removal", "type"):
            changed = deepcopy(self.snapshot)
            if change == "addition":
                changed["run"]["reconciling"] = True
            elif change == "removal":
                del changed["run"]["generation"]
            else:
                changed["run"]["generation"] = 7
            with self.subTest(change=change), self.assertRaisesRegex(RuntimeError, r"run."):
                release.require_snapshot_unchanged(self.snapshot, changed, "drift")

    def test_field_count_is_bounded(self):
        changed = deepcopy(self.snapshot)
        changed["run"].update({f"field{i}": i for i in range(100)})
        fields = release.snapshot_difference_paths(self.snapshot, changed)
        self.assertLessEqual(len(fields), 20)
        self.assertEqual(len(fields), 20)


if __name__ == "__main__":
    unittest.main()
