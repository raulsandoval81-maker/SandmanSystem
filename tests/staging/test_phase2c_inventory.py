"""Regression tests for the Phase 2C unrelated-function inventory guard."""
import ast
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = (ROOT / "scripts/staging/phase2c-functions.py").read_text()
tree = ast.parse(SOURCE)
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "untouched")
scope = {"json": json, "TARGETS": ["sendEnrollmentIntakeEmail", "recordManualEnrollmentIntakeDelivery"]}
exec(compile(ast.Module(body=[function], type_ignores=[]), "<inventory-function>", "exec"), scope)
untouched = scope["untouched"]


def function_record(name, filters=None, **extra):
    record = {"name": "projects/staging/locations/us-central1/functions/" + name,
              "status": "ACTIVE", "runtime": "nodejs22", **extra}
    if filters is not None:
        record["eventTrigger"] = {"eventType": "test.event", "eventFilters": filters}
    return record


class UnrelatedInventoryGuardTest(unittest.TestCase):
    def setUp(self):
        self.filters = [
            {"attribute": "database", "value": "(default)"},
            {"attribute": "document", "operator": "match-path-pattern", "value": "intakes/{intakeId}"},
            {"attribute": "namespace", "value": "(default)"},
        ]

    def test_reordering_event_filters_only_is_equal(self):
        before = [function_record("untouched", self.filters)]
        after = [function_record("untouched", list(reversed(self.filters)))]
        self.assertEqual(untouched(before), untouched(after))

    def test_changed_filter_is_detected(self):
        before = [function_record("untouched", self.filters)]
        changed = json.loads(json.dumps(self.filters))
        changed[0]["value"] = "(other)"
        self.assertNotEqual(untouched(before), untouched([function_record("untouched", changed)]))

    def test_dropped_or_duplicate_filter_is_detected(self):
        before = [function_record("untouched", self.filters)]
        self.assertNotEqual(untouched(before), untouched([function_record("untouched", self.filters[:-1])]))
        self.assertNotEqual(untouched(before), untouched([function_record("untouched", self.filters + [self.filters[0]])]))

    def test_other_configuration_change_is_detected(self):
        before = [function_record("untouched", self.filters, status="ACTIVE")]
        after = [function_record("untouched", self.filters, status="FAILED")]
        self.assertNotEqual(untouched(before), untouched(after))

    def test_only_approved_targets_are_excluded(self):
        before = [function_record("sendEnrollmentIntakeEmail", versionId="3"),
                  function_record("untouched", self.filters)]
        after = [function_record("sendEnrollmentIntakeEmail", versionId="4"),
                 function_record("untouched", self.filters)]
        self.assertEqual(untouched(before), untouched(after))


class IntakeCallableInventoryTest(unittest.TestCase):
    def setUp(self):
        names = ("getEnrollmentPlacementActivity", "getAccessSetupStatus")
        self.records = [{"name": f"projects/staging/locations/us-central1/functions/{name}",
                         "state": "ACTIVE"} for name in names]
        guard = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                     and n.name == "verify_intake_callables")
        namespace = {"PROJECT": "staging", "REQUIRED_INTAKE_CALLABLES": names}
        exec(compile(ast.Module(body=[guard], type_ignores=[]), "<callable-guard>", "exec"), namespace)
        self.verify = namespace["verify_intake_callables"]

    def test_accepts_both_active_callables(self):
        self.verify(self.records)

    def test_rejects_missing_or_inactive_callable(self):
        with self.assertRaisesRegex(RuntimeError, "getAccessSetupStatus"):
            self.verify(self.records[:1])
        self.records[1]["state"] = "FAILED"
        with self.assertRaisesRegex(RuntimeError, "getAccessSetupStatus"):
            self.verify(self.records)

    def test_rejects_callable_in_wrong_region(self):
        self.records[0]["name"] = self.records[0]["name"].replace("us-central1", "us-east1")
        with self.assertRaisesRegex(RuntimeError, "getEnrollmentPlacementActivity"):
            self.verify(self.records)


if __name__ == "__main__":
    unittest.main()
