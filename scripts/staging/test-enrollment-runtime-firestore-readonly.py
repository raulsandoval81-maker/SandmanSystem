#!/usr/bin/env python3
"""Offline regression tests for the runtime Firestore read-only gate."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).with_name("enrollment-runtime-firestore-readonly.py")
spec = importlib.util.spec_from_file_location("runtime_probe", SOURCE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

ENV = {
    "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
    "GITHUB_REF": "refs/heads/main",
    "GITHUB_WORKFLOW_REF": mod.WORKFLOW,
    "CONFIRM_PROJECT": mod.PROJECT,
    "REQUESTED_ACTION": "enrollment-runtime-iam-readonly",
    "GOOGLE_APPLICATION_CREDENTIALS": "/synthetic/credentials.json",
}


class ReadOnlyProbeTest(unittest.TestCase):
    def execute(self, statuses=None, token="synthetic"):
        with tempfile.TemporaryDirectory() as folder:
            old = os.getcwd()
            try:
                os.chdir(folder)
                with mock.patch.dict(os.environ, ENV, clear=True), \
                     mock.patch.object(mod, "get_runtime_token", side_effect=(RuntimeError("RUNTIME_IMPERSONATION_UNAVAILABLE") if token is None else None), return_value=token), \
                     mock.patch.object(mod, "get_status", side_effect=statuses) as get, \
                     mock.patch("sys.stderr", new_callable=io.StringIO):
                    code = mod.main()
                evidence = json.loads(mod.OUTPUT.read_text())
                return code, evidence, get.call_args_list
            finally:
                os.chdir(old)

    def test_missing_document_and_list_success(self):
        code, evidence, calls = self.execute([404, 200])
        self.assertEqual(code, 0)
        self.assertEqual(evidence["status"], "PASS")
        self.assertTrue(evidence["releaseReady"])
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0].args[0], mod.COLLECTION + "/" + mod.MISSING_DOC)
        self.assertEqual(calls[1].args[0], mod.COLLECTION + "?pageSize=1")
        self.assertNotIn("synthetic", json.dumps(evidence))

    def test_firestore_403_fails_closed(self):
        code, evidence, calls = self.execute([403, 200])
        self.assertEqual(code, 1)
        self.assertFalse(evidence["releaseReady"])
        self.assertEqual(evidence["status"], "BLOCKED")
        self.assertEqual(len(calls), 2)

    def test_impersonation_failure_is_not_permission_denial(self):
        code, evidence, calls = self.execute(token=None)
        self.assertEqual(code, 1)
        self.assertEqual(evidence["error"], "RUNTIME_IMPERSONATION_UNAVAILABLE")
        self.assertEqual(len(calls), 0)

    def test_trusted_boundary_required(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "TRUSTED_WORKFLOW_BOUNDARY_FAILED"):
                mod.check_boundary()


if __name__ == "__main__":
    unittest.main()
