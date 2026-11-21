import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/production/management_xp_recovery_candidate.py"
spec = importlib.util.spec_from_file_location("xp_recovery_candidate", SCRIPT)
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoverySpliceTest(unittest.TestCase):
    def setUp(self):
        self.prefix = b"exports.finalizeExperienceValidation = original;\n"
        self.original = self.prefix + recovery.CALLABLE + b" old();\n});\n"
        self.approved = b"exports.finalizeExperienceValidation = unrelated;\n" + recovery.CALLABLE + (
            b"\n" + recovery.SHARED_CALL + b" null);\n});\n"
        )
        self.authority = (b"original shared module;\n" + recovery.CLASSIFIER_START
                          + b"};\nfunction classifyAthlete(row) { return row; }\n"
                          + recovery.CLASSIFIER_END + b") {}\n")

    def test_exact_original_prefix_and_private_classifier(self):
        output = recovery.splice(self.original, self.approved, self.authority)
        self.assertEqual(output.split(recovery.CALLABLE)[0], self.prefix)
        self.assertIn(recovery.LOCAL_CALL, output)
        self.assertIn(b"function classifyManagementAdjustmentProgram(", output)
        self.assertNotIn(b"unrelated", output)
        self.assertNotIn(recovery.CLASSIFIER_END, output)

    def test_duplicate_marker_rejected(self):
        with self.assertRaisesRegex(ValueError, "source marker"):
            recovery.splice(self.original + recovery.CALLABLE, self.approved, self.authority)

    def test_classifier_drift_rejected(self):
        with self.assertRaisesRegex(ValueError, "classifier call"):
            recovery.splice(self.original, self.approved.replace(recovery.SHARED_CALL, b"other("), self.authority)

    def test_later_export_rejected(self):
        with self.assertRaisesRegex(ValueError, "final export"):
            recovery.splice(self.original, self.approved + b"exports.other = callback(() => {});\n", self.authority)

    def test_wrong_archive_is_rejected_before_parsing(self):
        with self.assertRaisesRegex(ValueError, "Baseline archive hash mismatch"):
            recovery.build(b"wrong", {})


if __name__ == "__main__":
    unittest.main()
