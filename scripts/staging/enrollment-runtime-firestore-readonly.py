#!/usr/bin/env python3
"""Staging-only effective Firestore GET/LIST probe using the Enrollment runtime identity.

No database writes, source changes, IAM changes, tokens or document content in artifacts.
A failure to impersonate the identity is a blocker, NOT evidence of denied Firestore access.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "sandman-combat-staging"
RUNTIME = f"sandman-billing-runtime@{PROJECT}.iam.gserviceaccount.com"
WORKFLOW = ("raulsandoval81-maker/SandmanSystem/.github/workflows/"
            "staging-exact-sha-release.yml@refs/heads/main")
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
# Dedicated synthetic-only collection; never list actual family or athlete documents.
COLLECTION = "stagingMetadata"
MISSING_DOC = "phase2c-runtime-iam-readonly-nonexistent-probe"
OUTPUT = Path("evidence/enrollment-runtime-iam/summary.json")


def check_boundary():
    expected = {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": WORKFLOW,
        "CONFIRM_PROJECT": PROJECT,
        "REQUESTED_ACTION": "enrollment-runtime-iam-readonly",
    }
    for key, value in expected.items():
        if os.environ.get(key) != value:
            raise RuntimeError("TRUSTED_WORKFLOW_BOUNDARY_FAILED")
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        raise RuntimeError("TRUSTED_CREDENTIALS_MISSING")


def get_runtime_token():
    try:
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token",
             f"--impersonate-service-account={RUNTIME}",
             "--project=" + PROJECT],
            text=True, timeout=40, stderr=subprocess.DEVNULL).strip()
    except (subprocess.SubprocessError, OSError):
        raise RuntimeError("RUNTIME_IMPERSONATION_UNAVAILABLE") from None
    if not token:
        raise RuntimeError("RUNTIME_IMPERSONATION_UNAVAILABLE")
    return token


def get_status(path, token):
    request = urllib.request.Request(
        BASE + "/" + path,
        headers={"Authorization": "Bearer " + token, "Accept": "application/json"},
        method="GET")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read(1024)  # discard data; never retain, log or upload content
            return response.status
    except urllib.error.HTTPError as exc:
        exc.close()
        return exc.code


def main():
    summary = {
        "project": PROJECT, "runtimeIdentity": RUNTIME,
        "mode": "RUNTIME_IMPERSONATED_FIRESTORE_READ_ONLY",
        "collection": COLLECTION,
        "releaseReady": False, "status": "BLOCKED", "checks": [],
    }
    try:
        check_boundary()
        token = get_runtime_token()
        # A missing document returns 404 only after authorized GET evaluation.
        get_code = get_status(f"{COLLECTION}/{MISSING_DOC}", token)
        summary["checks"].append({
            "operation": "documents.get", "httpStatus": get_code,
            "authorized": get_code in (200, 404),
        })
        # Single-page LIST; no personnel, athlete, payment or proposal content.
        list_code = get_status(f"{COLLECTION}?pageSize=1", token)
        summary["checks"].append({
            "operation": "documents.list", "httpStatus": list_code,
            "authorized": list_code == 200,
        })
        if all(check["authorized"] for check in summary["checks"]):
            summary["status"] = "PASS"
            summary["releaseReady"] = True
        else:
            summary["error"] = "RUNTIME_FIRESTORE_READ_UNVERIFIED"
    except RuntimeError as exc:
        summary["error"] = str(exc)
    except (urllib.error.URLError, TimeoutError, ValueError):
        summary["error"] = "FIRESTORE_TRANSPORT_UNVERIFIED"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(summary, indent=2) + "\n")
    print("Enrollment runtime Firestore read-only evidence:", summary["status"])
    for check in summary["checks"]:
        print(check["operation"], "HTTP", check["httpStatus"],
              "authorized" if check["authorized"] else "UNVERIFIED")
    if summary["status"] != "PASS":
        print("BLOCKED:", summary.get("error", "UNKNOWN"), file=sys.stderr)
        return 1
    print("PASS: exact runtime identity read both staging Firestore paths; no data retained.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
