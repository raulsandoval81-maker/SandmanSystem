from copy import deepcopy
import unittest

import receipt_intake_release as release


NAME = "saveProposalEnrollmentAgreement"
LATEST = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
READY = "CONDITION_SUCCEEDED"


def snapshot():
    condition = {"type": "Ready", "state": READY, "reason": "READY", "message": "Ready"}
    traffic = {"type": LATEST, "percent": 100}
    return {
        "function": {"buildConfig": {"runtime": "nodejs22"}, "serviceConfig": {}},
        "iam": {"bindings": [{"role": "roles/cloudfunctions.invoker", "members": ["user:test@example.invalid"]}]},
        "runIam": {"bindings": []},
        "run": {
            "buildConfig": {},
            "conditions": [condition],
            "terminalCondition": dict(condition),
            "reconciling": False,
            "traffic": [traffic],
            "trafficStatuses": [{**traffic, "revision": "revision-1", "uri": "https://old.example.invalid"}],
            "ingress": "INGRESS_TRAFFIC_ALL",
            "invokerIamDisabled": False,
            "template": {
                "serviceAccount": "runtime@example.invalid",
                "timeout": "60s",
                "maxInstanceRequestConcurrency": 80,
                "containers": [{
                    "image": "old",
                    "resources": {"limits": {"cpu": "1", "memory": "256Mi"}},
                    "env": [{"name": "PROJECT", "value": "test"},
                            {"name": "KEY", "valueSource": {"secretKeyRef": {"secret": "key", "version": "1"}}}],
                }],
            },
        },
    }


def changed(before, path, value):
    after = deepcopy(before)
    node = after
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value
    return after


class RuntimeComparisonTest(unittest.TestCase):
    def test_rollout_status_does_not_change_protected_configuration(self):
        before = snapshot()
        cases = [
            (("run", "conditions", 0, "reason"), "ROLLOUT_COMPLETE"),
            (("run", "conditions", 0, "state"), "CONDITION_PENDING"),
            (("run", "conditions", 0, "message"), "Revision is ready"),
            (("run", "terminalCondition", "message"), "Deployment succeeded"),
            (("run", "trafficStatuses", 0, "uri"), "https://new.example.invalid"),
        ]
        for path, value in cases:
            with self.subTest(path=path):
                after = changed(before, path, value)
                self.assertNotEqual(release.runtime(NAME, before), release.runtime(NAME, after))
                self.assertEqual(release.post_update_runtime(NAME, before), release.post_update_runtime(NAME, after))

    def test_unready_rollout_stops_verification(self):
        before = snapshot()
        for path, value in [
            (("run", "terminalCondition", "state"), "CONDITION_FAILED"),
            (("run", "reconciling"), True),
        ]:
            with self.subTest(path=path), self.assertRaisesRegex(RuntimeError, "rollout is not ready"):
                release.verify_updated_runtime(NAME, before, changed(before, path, value))

    def test_protected_drift_still_fails(self):
        before = snapshot()
        release.verify_updated_runtime(NAME, before, deepcopy(before))
        template = ("run", "template")
        container = template + ("containers", 0)
        cases = [
            (template + ("serviceAccount",), "other@example.invalid"),
            (template + ("timeout",), "120s"),
            (template + ("maxInstanceRequestConcurrency",), 20),
            (container + ("resources", "limits", "cpu"), "2"),
            (container + ("resources", "limits", "memory"), "512Mi"),
            (container + ("env", 0, "value"), "different"),
            (container + ("env", 1, "valueSource", "secretKeyRef", "version"), "2"),
            (("run", "ingress"), "INGRESS_TRAFFIC_INTERNAL_ONLY"),
            (("run", "invokerIamDisabled"), True),
            (("iam", "bindings"), []),
            (("runIam", "bindings"), before["iam"]["bindings"]),
            (("run", "traffic", 0, "type"), "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"),
            (("run", "trafficStatuses", 0, "percent"), 50),
        ]
        for path, value in cases:
            with self.subTest(path=path), self.assertRaisesRegex(RuntimeError, "runtime or IAM changed"):
                release.verify_updated_runtime(NAME, before, changed(before, path, value))
