"""Offline tests for the exact partial-release recovery checks."""
import copy
import importlib
import json
import unittest
from unittest.mock import patch

release = importlib.import_module("edge-case-pif-staging-release")


class RecoveryTest(unittest.TestCase):
    def setUp(self):
        self.name = release.RECOVERY_FUNCTION
        self.entry = {
            "configuration": {"name": "functions/" + self.name, "buildConfig": {},
                              "serviceConfig": {"revision": "manualedgecaseproposal-00003-lix"}},
            "iam": {"bindings": []},
            "run": {"buildConfig": {}, "template": {"client": "gcloud", "containers": []},
                    "latestReadyRevision": release.CONTINUATION_REVISION,
                    "traffic": [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", "percent": 100}]},
            "runIam": {"bindings": []},
            "rollbackRevision": release.CONTINUATION_REVISION,
        }
        self.evidence = {"hostingRollback": {"version": release.RECOVERY_HOSTING_VERSION},
                         "functions": {self.name: self.entry}}
        baseline = copy.deepcopy(self.entry)
        baseline["run"]["template"]["client"] = "cloudfunctions"
        config = {"function": baseline["configuration"], "transport": {
            "functions": baseline["iam"], "run": baseline["run"], "runIam": baseline["runIam"],
        }}
        normalized = release.protected.original.preserved_runtime_config(config)
        fingerprint = release.inventory.sha(
            json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode()
        )
        self.enterContext(patch.object(release, "RECOVERY_RUNTIME_SHA256", fingerprint))
        self.rollback = self.enterContext(patch.object(
            release.protected.preflight, "get", return_value={"name": release.RECOVERY_REVISION}))
        self.source = self.enterContext(patch.object(
            release.protected.original, "deployed_source", return_value=b"deployed archive"))
        self.verify = self.enterContext(patch.object(
            release.protected.continuation, "verify_deployed_archive"))
        self.enterContext(patch.object(
            release.protected.continuation, "expected_revision", return_value="00003-lix"))

    def resume(self):
        return release.verify_existing({self.name: {}}, self.evidence, b"candidate archive", "token")

    def test_exact_client_tag_preserves_runtime_and_verifies_source(self):
        self.assertEqual(self.resume(), {self.name: "00003-lix"})
        self.verify.assert_called_once_with(self.name, b"deployed archive", b"candidate archive")

    def test_iam_traffic_and_unknown_client_drift_are_rejected(self):
        for path, key, value in (
            (("runIam",), "bindings", [{"role": "roles/run.invoker", "members": ["allUsers"]}]),
            (("run", "traffic", 0), "percent", 50),
            (("run", "template"), "client", "unknown-client"),
        ):
            with self.subTest(path=path, key=key):
                original = copy.deepcopy(self.entry)
                target = self.entry
                for part in path:
                    target = target[part]
                target[key] = value
                with self.assertRaisesRegex(RuntimeError, "runtime differs"):
                    self.resume()
                self.entry.clear()
                self.entry.update(original)
        self.source.assert_not_called()

    def test_original_rollback_must_exist(self):
        self.rollback.return_value = {"name": "other"}
        with self.assertRaisesRegex(RuntimeError, "rollback revision unavailable"):
            self.resume()
        self.source.assert_not_called()

    def test_source_mismatch_blocks_recovery(self):
        self.verify.side_effect = RuntimeError("deployed source file mismatch")
        with self.assertRaisesRegex(RuntimeError, "source file mismatch"):
            self.resume()

    def test_hosting_and_active_revision_must_match(self):
        self.entry["rollbackRevision"] = "unexpected"
        with self.assertRaisesRegex(RuntimeError, "Unexpected active"):
            self.resume()
        self.evidence["hostingRollback"]["version"] = "unexpected"
        with self.assertRaisesRegex(RuntimeError, "Hosting rollback baseline changed"):
            self.resume()
        self.source.assert_not_called()


if __name__ == "__main__":
    unittest.main()
