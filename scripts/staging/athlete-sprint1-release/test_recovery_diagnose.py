"""Offline regression tests for partial staging reconciliation. No network or cloud writes."""
import copy
import unittest
from unittest.mock import patch

import recovery_diagnose as recovery


class FakeSnapshot:
    def __init__(self, value):
        self.value = value

    def snapshot(self, token):
        return self.value


class RecoveryReadOnlyTest(unittest.TestCase):
    def setUp(self):
        project = recovery.PROJECT
        location = recovery.REGION
        self.first = f"projects/{project}/locations/{location}/functions/{recovery.PROFILE}"
        original = [
            {"name": f"projects/{project}/locations/{location}/functions/legacy{i}",
             "state": "ACTIVE", "updateTime": "initial", "runtime": "nodejs22",
             "revision": f"legacy-{i}"}
            for i in range(53)
        ]
        created = {
            "name": self.first, "state": "ACTIVE", "updateTime": "created",
            "runtime": "nodejs22", "revision": "getathleteprofilefeed-00001-six"
        }
        base = {
            "project": project, "projectNumber": "991554514268",
            "firestore": {"ruleset": "unchanged"}, "hosting": {"version": "unchanged"},
            "functions": {"count": 53, "inventory": original},
        }
        current = copy.deepcopy(base)
        current["functions"] = {"count": 54, "inventory": [*original, created]}
        self.baseline = {"status": "PASS_READ_ONLY", "sourceSha": recovery.SOURCE_SHA,
                         "snapshot": base}
        self.current = current
        self.receipt = {
            "status": "STOP_NO_RETRY", "project": project,
            "sourceSha": recovery.SOURCE_SHA,
            "lastOperation": "enable-application-auth-transport-getAthleteProfileFeed",
            "created": [],
        }
        self.function = {
            "state": "ACTIVE", "environment": "GEN_2",
            "buildConfig": {"entryPoint": recovery.PROFILE, "runtime": "nodejs22"},
            "serviceConfig": {"serviceAccountEmail": f"sandman-billing-runtime@{project}.iam.gserviceaccount.com"},
            "labels": {"sandman-source-sha": recovery.SOURCE_SHA,
                       "sandman-athlete-sprint1": "v1"},
        }
        self.service = {
            "name": f"projects/{project}/locations/{location}/services/{recovery.PROFILE.lower()}",
            "invokerIamDisabled": False
        }

    def call(self, service_perms=None, project_perms=None):
        service_perms = service_perms or set()
        project_perms = project_perms or set()
        with patch.object(recovery, "snapshot_module", return_value=FakeSnapshot(self.current)), \
             patch.object(recovery, "read_api", side_effect=[self.function, self.service]), \
             patch.object(recovery, "test_permissions",
                          side_effect=[project_perms, service_perms]) as test:
            result = recovery.diagnose(self.baseline, self.receipt,
                                      "sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com",
                                      "fake-token")
        self.assertEqual(test.call_count, 2)
        for args in test.call_args_list:
            self.assertIn(":testIamPermissions", args.args[1])
        return result

    def test_realistic_partial_release_is_visible_not_reported_zero_change(self):
        got = self.call(project_perms={"cloudfunctions.functions.create"})
        self.assertEqual(got["status"], "PASS_READ_ONLY_PARTIAL_PROFILE_VERIFIED")
        self.assertEqual(got["unchangedOriginalFunctions"], 53)
        self.assertFalse(got["canModifyExistingProfileTransport"])
        self.assertFalse(got["deploymentAuthorized"])
        self.assertFalse(got["skills"]["exists"])

    def test_existing_iam_right_is_reported_without_grant(self):
        got = self.call(service_perms={"run.services.setIamPolicy"},
                        project_perms={"run.services.setIamPolicy", "cloudfunctions.functions.create"})
        self.assertTrue(got["canModifyExistingProfileTransport"])
        self.assertTrue(got["canCreateSecondFunction"])

    def test_unrelated_function_changes_are_rejected(self):
        self.current["functions"]["inventory"][0]["revision"] = "changed"
        with self.assertRaises(ValueError):
            self.call()

    def test_second_function_or_unrelated_third_function_is_rejected(self):
        self.current["functions"]["inventory"].append({
            "name": f"projects/{recovery.PROJECT}/locations/{recovery.REGION}/functions/{recovery.SKILLS}",
            "state": "ACTIVE",
        })
        self.current["functions"]["count"] += 1
        with self.assertRaises(ValueError):
            self.call()

    def test_hosting_drift_is_rejected(self):
        self.current["hosting"]["version"] = "modified"
        with self.assertRaises(ValueError):
            self.call()

    def test_unrecognized_partial_receipt_is_rejected(self):
        self.receipt["lastOperation"] = "deployed-hosting"
        with self.assertRaises(ValueError):
            self.call()

    def test_unexpected_profile_origin_is_rejected(self):
        self.function["labels"]["sandman-source-sha"] = "unexpected"
        with self.assertRaises(ValueError):
            self.call()


if __name__ == "__main__":
    unittest.main()
