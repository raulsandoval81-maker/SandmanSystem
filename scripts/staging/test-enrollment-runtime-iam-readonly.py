#!/usr/bin/env python3
"""Regression: unsupported Firestore policy resource must never authorize deployment."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import urllib.error

SOURCE = Path(__file__).resolve().with_name("enrollment-runtime-iam-readonly.py")
spec = importlib.util.spec_from_file_location("enrollment_runtime_iam", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InvalidFirestoreResourceTest(unittest.TestCase):
    def test_database_invalid_resource_fallback_remains_blocked(self):
        error_body = json.dumps({"error": {
            "status": "INVALID_ARGUMENT",
            "details": [{"@type": "type.googleapis.com/google.rpc.BadRequest",
                         "fieldViolations": [{"field": "accessTuple.fullResourceName"}]}],
        }}).encode()

        calls = []

        def fake_query(permission, token, resource=module.RESOURCE):
            calls.append((permission, resource))
            if resource == module.RESOURCE:
                raise urllib.error.HTTPError(
                    "https://policytroubleshooter.googleapis.com/v3/iam:troubleshoot",
                    400, "INVALID_ARGUMENT", {}, io.BytesIO(error_body))
            return {"overallAccessState": "CAN_ACCESS", "accessTuple": {
                "principal": module.PRINCIPAL, "fullResourceName": resource,
                "permission": permission}}

        env = {
            "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": module.WORKFLOW,
            "CONFIRM_PROJECT": module.PROJECT,
            "REQUESTED_ACTION": "enrollment-runtime-iam-readonly",
            "GOOGLE_APPLICATION_CREDENTIALS": "/synthetic/credentials.json",
        }
        with tempfile.TemporaryDirectory() as directory:
            old = os.getcwd()
            try:
                os.chdir(directory)
                with mock.patch.dict(os.environ, env, clear=True), \
                     mock.patch.object(module, "query", side_effect=fake_query), \
                     mock.patch.object(module.subprocess, "check_output", return_value="synthetic-token"), \
                     mock.patch("sys.stderr", new_callable=io.StringIO):
                    exit_code = module.main()
                summary = json.loads(Path("evidence/enrollment-runtime-iam/summary.json").read_text())
            finally:
                os.chdir(old)
        self.assertEqual(exit_code, 1)
        self.assertEqual(summary["status"], "BLOCKED")
        self.assertIs(summary["releaseReady"], False)
        self.assertEqual(len(summary["checks"]), 2)
        self.assertTrue(all(c["projectPolicyState"] == "CAN_ACCESS" for c in summary["checks"]))
        self.assertTrue(all(c["databaseAccessProven"] is False for c in summary["checks"]))
        self.assertEqual(
            calls,
            [(p, r) for p in module.PERMISSIONS for r in (module.RESOURCE, module.PROJECT_RESOURCE)],
        )


if __name__ == "__main__":
    unittest.main()
