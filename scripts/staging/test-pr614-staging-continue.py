"""Offline invariants for the strictly scoped PR614 partial-staging continuation."""
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).with_name("pr614-staging-continue.py")
spec = importlib.util.spec_from_file_location("pr614_continue", PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ContinuationTests(unittest.TestCase):
    def test_disjoint_exact_run347_scope(self):
        self.assertEqual(set(module.ALREADY_UPDATED), {
            "approveAndActivate", "sendProposalPrepaidCashReceipt",
            "sendEnrollmentIntakeEmail", "hydrateEnrollmentIntakePrefill"})
        self.assertEqual(set(module.REMAINING), {
            "approveIntakeCall", "acceptProposalClientReview",
            "issueProposalEnrollmentHandoff", "saveProposalEnrollmentAgreement"})
        self.assertEqual(set(module.ALREADY_UPDATED) | set(module.REMAINING), set(module.original.FUNCTIONS))

    def test_unique_approval_and_exact_rollback(self):
        good = {
            "GITHUB_REPOSITORY": module.inventory.REPO,
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": module.inventory.WORKFLOW,
            "REQUESTED_ACTION": module.ACTION,
            "CONFIRM_PROJECT": module.PROJECT, "CONFIRM_SHA": module.SHA,
            "DEPLOY_APPROVAL": module.APPROVAL,
            "EXPECTED_HOSTING_RELEASE": "sites/sandman-combat-staging/releases/1794258558062000",
            "EXPECTED_HOSTING_VERSION": "sites/sandman-combat-staging/versions/8f33ab588a8c7fdd",
        }
        module.guard(good)
        for key in good:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                module.guard({**good, key: "wrong"})

    def test_existing_function_revisions_locked(self):
        self.assertEqual(module.ALREADY_UPDATED["sendEnrollmentIntakeEmail"], "7")
        self.assertEqual(module.REMAINING["approveIntakeCall"], "00001-tul")
        self.assertEqual(module.PREPARED_HOSTING,
                         "sites/sandman-combat-staging/versions/32d5bddfa69e2f06")

    def test_workflow_has_separate_protected_action(self):
        workflow = (PATH.parents[2] / ".github/workflows/staging-exact-sha-release.yml").read_text()
        self.assertIn("  pr614-staging-continue:", workflow)
        self.assertIn("inputs.action == 'pr614-staging-continue'", workflow)
        self.assertIn("environment: staging", workflow[workflow.index("  pr614-staging-continue:"):])
        self.assertIn("python3 scripts/staging/pr614-staging-continue.py",
                      workflow[workflow.index("  pr614-staging-continue:"):])


if __name__ == "__main__":
    unittest.main()
