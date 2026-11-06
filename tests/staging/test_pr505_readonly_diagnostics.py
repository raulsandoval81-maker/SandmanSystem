#!/usr/bin/env python3
"""Offline test of safe read-only staging command diagnostics."""
import importlib.util
from pathlib import Path
import subprocess
from unittest.mock import patch

file = Path(__file__).resolve().parents[2] / "scripts/staging/pr505-2c-live-readonly-inventory.py"
spec = importlib.util.spec_from_file_location("pr505_inventory", file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def failed(stderr):
    return subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr=stderr)

args = ("gcloud", "functions", "describe", "sendProposalPrepaidCashReceipt",
        "--gen2", "--project", module.PROJECT, "--region", module.REGION, "--format=json")

for raw, category in [
    ("ERROR: (gcloud.functions.describe) ResponseError: status=[403] Permission denied for account secret-user@example.com", "PERMISSION_DENIED"),
    ("ERROR: (gcloud.functions.describe) ResponseError: status=[404] not found", "NOT_FOUND"),
    ("ERROR: unrecognized arguments: --some-flag", "CLI_ARGUMENT"),
    ("ERROR: secret-token-should-not-leak", "UNKNOWN")
]:
    with patch.object(module.subprocess, "run", return_value=failed(raw)):
        try:
            module.cmd(*args)
            raise AssertionError("expected failure")
        except RuntimeError as e:
            assert "category=" + category in str(e), str(e)
            assert raw not in str(e), "raw stderr disclosed"
            assert "secret-user@example.com" not in str(e)
            assert "secret-token-should-not-leak" not in str(e)

# Denied Gen2 lookup must not fall back or report a missing Function.
with patch.object(module.subprocess, "run", return_value=failed("403 Permission denied")) as run:
    try:
        module.parse_function("sendProposalPrepaidCashReceipt")
        raise AssertionError("expected fail-closed error")
    except RuntimeError as e:
        assert "FUNCTION_LOOKUP_BLOCKED" in str(e)
        assert "PERMISSION_DENIED" in str(e)
        assert run.call_count == 1, "must not fallback after denied lookup"

print("PR505_READONLY_DIAGNOSTICS_FAIL_CLOSED_TEST_PASS")

# The Cloud Run read failure must identify describe versus get-iam-policy
# without revealing any cloud error text.
for action in ("describe", "get-iam-policy"):
    with patch.object(module.subprocess, "run", return_value=failed("secret-do-not-log")):
        try:
            module.cmd("gcloud", "run", "services", action, "issueproposalenrollmenthandoff",
                       "--project", module.PROJECT, "--region", module.REGION, "--format=json")
            raise AssertionError("expected cloud read failure")
        except RuntimeError as e:
            message = str(e)
            assert "action=gcloud run services " + action in message
            assert "category=UNKNOWN" in message
            assert "errorFingerprint=" in message
            assert "secret-do-not-log" not in message

print("PR505_CLOUDRUN_READ_COMMAND_DETAIL_TEST_PASS")
