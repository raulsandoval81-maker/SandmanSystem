"""Fail-closed, credential-free Sprint 1 manifest regression tests."""
import copy
import json
from pathlib import Path
import os
import unittest

from validate_release_candidate import verify_evidence

HERE = Path(__file__).parent


class TestSprint1ReleaseCandidate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((HERE / "release-manifest.json").read_text())
        path = os.getenv("SPRINT1_EVIDENCE_JSON")
        cls.raw = Path(path).read_bytes() if path else None

    def test_release_is_non_deploying(self):
        m = self.manifest
        self.assertIs(m["productionAuthorized"], False)
        self.assertIs(m["deploymentAuthorized"], False)
        self.assertEqual(m["project"], "sandman-combat-staging")
        self.assertEqual(m["status"], "PREPARATION_ONLY_NO_DEPLOYMENT")

    def test_exact_host_and_function_allowlists(self):
        m = self.manifest
        self.assertEqual(len(m["hostingPaths"]), 18)
        self.assertEqual(len(set(m["hostingPaths"])), 18)
        self.assertEqual(set(m["hostingPaths"]), set(m["baselineHostingHashes"]))
        self.assertEqual({item["name"] for item in m["functions"]},
                         {"getAthleteProfileFeed", "getAthleteSkillsSummary"})
        self.assertEqual(len(m["sourceFilesSha256"]), 22)

    def test_evidence_verification(self):
        if self.raw is None:
            self.skipTest("Provide the protected read-only artifact JSON with SPRINT1_EVIDENCE_JSON")
        self.assertEqual(verify_evidence(self.manifest, self.raw)["status"],
                         "PASS_OFFLINE_EVIDENCE_ONLY")

    def test_unapproved_scope_is_rejected(self):
        if self.raw is None:
            self.skipTest("Provide protected evidence JSON")
        m = copy.deepcopy(self.manifest)
        m["functions"].append({"name": "approveAndActivate", "region": "us-central1",
                               "mode": "update", "generation": "v2"})
        with self.assertRaises(ValueError):
            verify_evidence(m, self.raw)

    def test_changed_baseline_is_rejected(self):
        if self.raw is None:
            self.skipTest("Provide protected evidence JSON")
        m = copy.deepcopy(self.manifest)
        m["expectedBaseline"]["hostingManifestSha256"] = "0" * 64
        with self.assertRaises(ValueError):
            verify_evidence(m, self.raw)


if __name__ == "__main__":
    unittest.main()
