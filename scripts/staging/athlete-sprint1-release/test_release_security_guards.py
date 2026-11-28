"""Offline release security regressions. No cloud credentials, writes, or project calls."""
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

import release_rules_hosting as rules
import release_functions as functions


class GuardTests(unittest.TestCase):
    def test_missing_dispatch_or_approval_cannot_publish(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                rules.audit("publish")
            with self.assertRaises(RuntimeError):
                functions.check_guard("deploy")

    def test_unrelated_rules_change_is_rejected(self):
        path = "scripts/staging/p0-containment/firestore.rules"
        old = subprocess.check_output([
            "git", "-C", str(rules.ROOT), "show", rules.OLD_SOURCE + ":" + path
        ]).decode()
        reviewed = subprocess.check_output([
            "git", "-C", str(rules.ROOT), "show", rules.EXPECTED_SOURCE + ":" + path
        ]).decode()
        self.assertEqual(rules.reviewed_rules_patch(old), reviewed)
        with self.assertRaises((RuntimeError, subprocess.CalledProcessError)):
            rules.reviewed_rules_patch(old + "\n// unrelated live-rule drift\n")

    def test_hosting_allowlist_is_exact_and_source_bytes_match(self):
        files = rules.approved_hosting_bytes()
        self.assertEqual(set(files), set(rules.manifest()["hostingPaths"]))
        self.assertEqual(len(files), 18)
        for name, (digest, zipped, data) in files.items():
            self.assertEqual(digest, rules.sha(zipped))
            self.assertEqual(rules.sha(data), rules.manifest()["sourceFilesSha256"]["public" + name])

    def test_existing_release_protection_unchanged(self):
        m = rules.manifest()
        self.assertFalse(m["productionAuthorized"])
        self.assertFalse(m["deploymentAuthorized"])
        self.assertEqual(m["sourceSha"], rules.EXPECTED_SOURCE)
        self.assertEqual(m["releaseOrder"],
                         ["functions", "firestore-rules", "hosting", "authenticated-staging-acceptance"])


if __name__ == "__main__":
    unittest.main()
