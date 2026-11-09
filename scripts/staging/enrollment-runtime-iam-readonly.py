#!/usr/bin/env python3
"""Read-only Policy Troubleshooter v3 check of two Firestore runtime permissions."""
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "sandman-combat-staging"
PRINCIPAL = f"sandman-billing-runtime@{PROJECT}.iam.gserviceaccount.com"
RESOURCE = f"//firestore.googleapis.com/projects/{PROJECT}/databases/(default)"
PROJECT_RESOURCE = f"//cloudresourcemanager.googleapis.com/projects/{PROJECT}"
PERMISSIONS = ("datastore.entities.get", "datastore.entities.list")
WORKFLOW = ("raulsandoval81-maker/SandmanSystem/.github/workflows/"
            "staging-exact-sha-release.yml@refs/heads/main")


def require(value, message):
    if not value:
        raise RuntimeError(message)


def guard():
    require(os.environ.get("GITHUB_REPOSITORY") == "raulsandoval81-maker/SandmanSystem", "repository mismatch")
    require(os.environ.get("GITHUB_REF") == "refs/heads/main", "branch mismatch")
    require(os.environ.get("GITHUB_WORKFLOW_REF") == WORKFLOW, "workflow mismatch")
    require(os.environ.get("CONFIRM_PROJECT") == PROJECT, "project mismatch")
    require(os.environ.get("REQUESTED_ACTION") == "enrollment-runtime-iam-readonly", "action mismatch")
    require(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"), "missing trusted WIF credentials")


def query(permission, token, resource=RESOURCE):
    payload = json.dumps({"accessTuple": {
        "principal": PRINCIPAL,
        "fullResourceName": resource,
        "permission": permission,
    }}).encode()
    request = urllib.request.Request(
        "https://policytroubleshooter.googleapis.com/v3/iam:troubleshoot",
        data=payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "x-goog-user-project": PROJECT},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        return json.load(response)


def sanitized_http_error(exc):
    """Return only bounded non-sensitive Google error diagnostics."""
    details = {"httpStatus": exc.code, "googleStatus": "UNKNOWN", "reason": "UNKNOWN"}
    try:
        raw = exc.read(8192)
        payload = json.loads(raw)
        err = payload.get("error", {})
        allowed_statuses = {"INVALID_ARGUMENT", "FAILED_PRECONDITION",
                            "PERMISSION_DENIED", "UNAUTHENTICATED", "NOT_FOUND",
                            "RESOURCE_EXHAUSTED", "UNAVAILABLE"}
        status = err.get("status")
        if status in allowed_statuses:
            details["googleStatus"] = status
        for item in err.get("details", []):
            if not isinstance(item, dict):
                continue
            if item.get("@type", "").endswith("google.rpc.ErrorInfo"):
                reason = item.get("reason", "")
                if isinstance(reason, str) and len(reason) <= 80 and reason.replace("_", "").isalnum():
                    details["reason"] = reason
            elif item.get("@type", "").endswith("google.rpc.BadRequest"):
                fields = [x.get("field", "") for x in item.get("fieldViolations", [])
                          if isinstance(x, dict) and x.get("field") in
                          ("accessTuple", "accessTuple.fullResourceName", "accessTuple.permission",
                           "accessTuple.principal")]
                if fields:
                    details["fields"] = sorted(set(fields))
    except (ValueError, UnicodeError, TypeError):
        pass
    return details


def main():
    guard()
    evidence_dir = Path("evidence/enrollment-runtime-iam")
    evidence_dir.mkdir(parents=True, exist_ok=True)
    result = {
        "project": PROJECT,
        "principal": PRINCIPAL,
        "resource": RESOURCE,
        "requestedPermissions": list(PERMISSIONS),
        "mode": "READ_ONLY",
        "releaseReady": False,
        "checks": [],
    }
    errors = []
    try:
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token"],
            text=True, timeout=30,
            stderr=subprocess.DEVNULL,
        ).strip()
        require(bool(token), "credential acquisition unavailable")
        for permission in PERMISSIONS:
            try:
                response = query(permission, token)
                state = response.get("overallAccessState", "MISSING")
                tuple_data = response.get("accessTuple", {})
                require(tuple_data.get("principal") == PRINCIPAL and
                        tuple_data.get("fullResourceName") == RESOURCE and
                        tuple_data.get("permission") == permission,
                        "Policy Troubleshooter returned an unexpected access tuple")
                result["checks"].append({"permission": permission, "overallAccessState": state})
                if state != "CAN_ACCESS":
                    errors.append(permission + ": " + state)
            except urllib.error.HTTPError as exc:
                diagnostic = sanitized_http_error(exc)
                # Some valid Firestore database names are not accepted by the
                # Policy Troubleshooter resource parser. A project-level check
                # may help diagnose IAM, but MUST NOT authorize deployment:
                # database-scoped policies and conditions remain unproven.
                if (exc.code == 400 and
                        diagnostic.get("googleStatus") == "INVALID_ARGUMENT" and
                        "accessTuple.fullResourceName" in diagnostic.get("fields", [])):
                    try:
                        fallback = query(permission, token, PROJECT_RESOURCE)
                        fallback_tuple = fallback.get("accessTuple", {})
                        require(fallback_tuple.get("principal") == PRINCIPAL and
                                fallback_tuple.get("fullResourceName") == PROJECT_RESOURCE and
                                fallback_tuple.get("permission") == permission,
                                "Project-scope response tuple mismatch")
                        result["checks"].append({
                            "permission": permission,
                            "error": "DATABASE_RESOURCE_UNSUPPORTED",
                            "diagnostic": diagnostic,
                            "projectPolicyState": fallback.get("overallAccessState", "MISSING"),
                            "projectPolicyResource": PROJECT_RESOURCE,
                            "databaseAccessProven": False,
                        })
                    except (urllib.error.HTTPError, urllib.error.URLError,
                            TimeoutError, ValueError, RuntimeError):
                        result["checks"].append({
                            "permission": permission,
                            "error": "DATABASE_RESOURCE_UNSUPPORTED",
                            "diagnostic": diagnostic,
                            "projectPolicyState": "UNVERIFIED",
                            "databaseAccessProven": False,
                        })
                    errors.append(permission + ": database-scoped access not proven; project-policy check is diagnostic only")
                else:
                    result["checks"].append({"permission": permission, "error": "IAM_API_HTTP_" + str(exc.code),
                                             "diagnostic": diagnostic})
                    errors.append(permission + ": IAM API request failed (HTTP " + str(exc.code) + ")")
            except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
                result["checks"].append({"permission": permission, "error": "UNVERIFIED"})
                errors.append(permission + ": IAM access could not be established (" + type(exc).__name__ + ")")
    except (subprocess.SubprocessError, RuntimeError) as exc:
        errors.append("Trusted credential unavailable: " + type(exc).__name__)
    result["status"] = "PASS" if not errors and len(result["checks"]) == 2 else "BLOCKED"
    result["releaseReady"] = result["status"] == "PASS"
    result["errors"] = errors
    (evidence_dir / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
    print("Enrollment runtime Firestore IAM evidence:", result["status"])
    for check in result["checks"]:
        print(check["permission"], check.get("overallAccessState", check.get("error", "UNVERIFIED")))
    if errors:
        print("BLOCKED: permissions not fully proven; do not deploy.", file=sys.stderr)
        return 1
    print("PASS: IAM policy evaluation granted both requested Firestore read permissions. No deployment performed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
