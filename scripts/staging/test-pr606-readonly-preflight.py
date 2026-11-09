import io
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

p = runpy.run_path(str(Path(__file__).with_name("pr606-readonly-preflight.py")))


class PreflightTests(unittest.TestCase):
    def test_guard_rejects_drift(self):
        env = {"GITHUB_REPOSITORY": p["REPO"], "GITHUB_REF": "refs/heads/main",
               "GITHUB_WORKFLOW_REF": p["WORKFLOW"], "CONFIRM_PROJECT": p["PROJECT"],
               "CONFIRM_SHA": p["SHA"], "REQUESTED_ACTION": "pr606-readonly-preflight"}
        p["guard"](env)
        for key in env:
            with self.subTest(key=key), self.assertRaisesRegex(RuntimeError, key):
                p["guard"]({**env, key: "unapproved"})

    def test_rejects_live_key_and_reports_http_error_without_body(self):
        p["stripe_test_key"](b"sk_test_fixture")
        with self.assertRaisesRegex(RuntimeError, "test-mode"):
            p["stripe_test_key"](b"sk_live_fixture")
        error = urllib.error.HTTPError("https://example.test", 403, "forbidden", {}, io.BytesIO(b"sensitive"))
        with patch("urllib.request.build_opener") as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaisesRegex(RuntimeError, "^Secret access: HTTP 403$"):
                p["read"]("Secret access", "https://example.test")
        with self.assertRaisesRegex(RuntimeError, "Unexpected source URL operation"):
            p["read"]("Unexpected", "https://example.test", signed_url_request={})

    def test_archive_rejects_credential_like_file(self):
        for path in ("index.js", ".env.local"):
            data = io.BytesIO()
            with zipfile.ZipFile(data, "w") as archive:
                archive.writestr(path, "fixture")
            if path == "index.js":
                self.assertEqual(p["archive_evidence"](data.getvalue())["sha256"], p["sha"](data.getvalue()))
            else:
                with self.assertRaisesRegex(RuntimeError, "credential-like"):
                    p["archive_evidence"](data.getvalue())

    def test_hosting_preserves_other_paths_and_detects_drift(self):
        calls = 0
        def get(operation, _url):
            nonlocal calls
            if operation == "Hosting active release":
                calls += 1
                release = "2" if drift and calls > 1 else "1"
                return {"releases": [{"name": p["SITE"] + "/releases/" + release,
                                      "version": {"name": p["SITE"] + "/versions/baseline"}}]}
            if operation == "Hosting version configuration":
                return {"status": "FINALIZED", "config": {}}
            return {"files": [{"path": path, "hash": "a" * 64, "status": "ACTIVE"}
                              for path in [p["TARGET"], "/untouched.js"]]}
        drift = False
        baseline = p["hosting"](get, b"candidate")
        self.assertEqual(baseline["proposed"]["/untouched.js"], baseline["manifest"]["/untouched.js"])
        self.assertEqual(baseline["version"], baseline["rollbackVersion"])
        drift, calls = True, 0
        with self.assertRaisesRegex(RuntimeError, "release changed"):
            p["hosting"](get, b"candidate")

    def test_workflow_scope(self):
        workflow = (Path(__file__).parents[2] / ".github/workflows/staging-exact-sha-release.yml").read_text()
        job = workflow.split("\n  pr606-readonly-preflight:\n", 1)[1]
        self.assertIn("environment: staging", job)
        self.assertIn(p["SHA"], job)
        self.assertIn("sandman-practice-deployer@", job)
        self.assertNotRegex(job, r"\bgcloud .*\b(deploy|update|delete)\b")
        self.assertEqual(set(p["FUNCTIONS"]), {"sendEnrollmentIntakeEmail",
                         "sendProposalPrepaidCashReceipt", "recordManualEnrollmentIntakeDelivery"})


if __name__ == "__main__":
    unittest.main()
