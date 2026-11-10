import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


def load(name):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


deploy = load("pr614-staging-deploy.py")


class Pr614ReleaseTests(unittest.TestCase):
    def test_exact_scope_excludes_legacy_creator(self):
        self.assertEqual(set(deploy.FUNCTIONS), {
            "approveAndActivate", "sendProposalPrepaidCashReceipt", "sendEnrollmentIntakeEmail",
            "hydrateEnrollmentIntakePrefill", "approveIntakeCall", "acceptProposalClientReview",
            "issueProposalEnrollmentHandoff", "saveProposalEnrollmentAgreement",
        })
        self.assertNotIn("createAthleteFromIntakeCall", deploy.FUNCTIONS)
        self.assertEqual(deploy.ASSETS, (
            "/connect/proposals/review/review.js", "/connect/enrollment/enrollment.js",
            "/connect/enrollment/enrollment.service.js", "/intake-management/management.intake.js",
        ))

    def test_guard_requires_unique_approval_and_exact_sha(self):
        env = {
            "GITHUB_REPOSITORY": deploy.inventory.REPO, "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": deploy.inventory.WORKFLOW, "REQUESTED_ACTION": deploy.ACTION,
            "CONFIRM_PROJECT": deploy.PROJECT, "CONFIRM_SHA": deploy.SHA,
            "DEPLOY_APPROVAL": deploy.APPROVAL, "EXPECTED_HOSTING_RELEASE": "release",
            "EXPECTED_HOSTING_VERSION": "version",
        }
        deploy.guard(env)
        for key in env:
            with self.subTest(key=key), self.assertRaisesRegex(RuntimeError, key):
                deploy.guard({**env, key: ""})

    def test_preflight_uses_existing_rules_authority(self):
        source = Path(__file__).with_name("pr614-readonly-preflight.py").read_text()
        self.assertIn('surface in {"hosting", "rules"}', source)
        self.assertIn('base + f"projects/{PROJECT}/releases/cloud.firestore", host_token', source)
        self.assertNotIn('"createAthleteFromIntakeCall": (2,', source)

    def test_build_is_isolated_from_clean_release_candidate(self):
        workflow = Path(__file__).parents[2] / ".github/workflows/staging-exact-sha-release.yml"
        source = workflow.read_text()
        job = source[source.index("  pr614-staging-deploy:"):]
        self.assertIn("PR614_BUILD_ROOT: pr614-build", job)
        self.assertIn("path: pr614-candidate", job)
        self.assertIn("path: pr614-build", job)
        self.assertIn("npm --prefix pr614-build/functions run build", job)
        self.assertNotIn("npm --prefix pr614-candidate/functions run build", job)
        preflight = Path(__file__).with_name("pr614-readonly-preflight.py").read_text()
        self.assertIn('status", "--porcelain", "--untracked-files=no"', preflight)

    def test_release_is_source_only_and_has_no_payment_or_stripe_operation(self):
        source = Path(__file__).with_name("pr614-staging-deploy.py").read_text()
        self.assertIn("release.source_update(name, archive, function_token)", source)
        self.assertIn("runtime identity, IAM, secrets, or transport changed", source)
        self.assertNotRegex(source, r"stripe|recordProposalPrepaidCash")

    def test_rules_release_updates_only_cloud_firestore(self):
        old = {"release": "projects/sandman-combat-staging/releases/cloud.firestore"}
        ruleset = "projects/sandman-combat-staging/rulesets/reviewed"
        with patch.object(deploy, "write", side_effect=[
            {"name": ruleset}, {"rulesetName": ruleset},
        ]) as write:
            self.assertEqual(deploy.deploy_rules("rules", old, "token"), ruleset)
        self.assertEqual(write.call_args_list[0].args[1],
            "https://firebaserules.googleapis.com/v1/projects/sandman-combat-staging/rulesets")
        self.assertEqual(write.call_args_list[1].args[1],
            "https://firebaserules.googleapis.com/v1/projects/sandman-combat-staging/releases/cloud.firestore")
        self.assertEqual(write.call_args_list[1].args[3]["updateMask"], "rulesetName")


if __name__ == "__main__":
    unittest.main()
