#!/usr/bin/env python3
"""Read-only, sanitized staging preflight for the new Emmett 2C receipt callable.

No deploy, IAM mutation, Firestore, email, Stripe, secret payload, or Hosting writes.
A successful preflight is NOT deployment authorization.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

PROJECT = "sandman-combat-staging"
REGION = "us-central1"
TARGET = "sendProposalPrepaidCashReceipt"
SHA = "b4b40798b58aac46706dce984427e77d501855e7"
DEPLOYER = "sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com"
ACCOUNTS = (
    "sandman-practice-build@sandman-combat-staging.iam.gserviceaccount.com",
    "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com",
)
APPROVED_COMMANDS = {
    ("gcloud", "functions", "list"),
    ("gcloud", "secrets", "describe"),
    ("gcloud", "secrets", "versions", "list"),
    ("gcloud", "secrets", "get-iam-policy"),
    ("gcloud", "iam", "service-accounts", "describe"),
}
def require(value, message):
    if not value:
        raise RuntimeError(message)

def run_read(*args):
    require(any(args[:len(prefix)] == prefix for prefix in APPROVED_COMMANDS),
            "Unapproved command type")
    require("--project=" + PROJECT in args, "Unexpected cloud project")
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode:
        # Never persist/echo raw cloud diagnostics or credentials.
        fingerprint = hashlib.sha256(result.stderr.encode()).hexdigest()[:12]
        diagnostic = result.stderr.lower()
        if re.search(r"permission.denied|permission denied|does not have permission|forbidden|\\b403\\b", diagnostic):
            category = "PERMISSION_DENIED"
        elif re.search(r"not.found|not found|does not exist|\\b404\\b", diagnostic):
            category = "NOT_FOUND"
        elif re.search(r"unauthorized|unauthenticated|\\b401\\b|invalid credential", diagnostic):
            category = "AUTHENTICATION"
        elif re.search(r"unrecognized arguments|invalid choice|unknown command|invalid argument", diagnostic):
            category = "CLI_ARGUMENT"
        else:
            category = "UNKNOWN"
        raise RuntimeError("Read-only metadata query failed: " + " ".join(args[:3]) +
                           " category=" + category + " fingerprint=" + fingerprint)
    return json.loads(result.stdout)

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def main():
    require(os.environ.get("GITHUB_REPOSITORY") == "raulsandoval81-maker/SandmanSystem",
            "Repository guard")
    require(os.environ.get("GITHUB_REF") == "refs/heads/main", "Main branch guard")
    require(os.environ.get("GITHUB_WORKFLOW_REF") ==
            "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main",
            "Trusted workflow guard")
    require(os.environ.get("CONFIRM_PROJECT") == PROJECT, "Staging confirmation guard")
    require(os.environ.get("REQUESTED_ACTION") == "emmett-2c-receipt-readonly-preflight",
            "Preflight action guard")
    root = Path("trusted-tooling")
    app = Path("application")
    plan = json.loads((root / "scripts/staging/emmett-2c-receipt-bootstrap-review.json").read_text())
    require(plan["projectId"] == PROJECT and plan["region"] == REGION and
            plan["applicationSha"] == SHA and plan["scope"]["functions"] == [TARGET] and
            plan["scope"]["hostingAssets"] == [] and
            all(plan["guards"][name] is False for name in (
                "deploymentAuthorized", "productionAuthorized", "iamChangesAuthorized",
                "hostingWritesAuthorized", "firestoreWritesAuthorized",
                "stripeOperationsAuthorized", "sendEmailsAuthorized",
                "secretValueAccessAuthorized")), "Review-only plan guard")
    checked = subprocess.check_output(
        ["git", "-C", str(app), "rev-parse", "HEAD"], text=True).strip()
    require(checked == SHA, "Immutable application checkout drift")
    # Validate the exact identity bound by the trusted protected workflow.
    # Cloud IAM forbids the deployer from describing itself; a successful
    # authenticated staging Functions API read establishes the scoped identity
    # is operational, not that it has deploy permissions.
    workflow = (root / ".github/workflows/staging-exact-sha-release.yml").read_text()
    job_marker = "  emmett-2c-receipt-readonly-preflight:"
    require(workflow.count(job_marker) == 1, "Trusted preflight job identity missing")
    job_text = workflow.split(job_marker, 1)[1]
    job_text = re.split(r"(?m)^  [a-z][a-z0-9-]*:[ \\t]*$", job_text, maxsplit=1)[0]
    require("service_account: " + DEPLOYER in job_text and
            "workload_identity_provider: projects/991554514268/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-hybrid-staging" in job_text and
            "project_id: " + PROJECT in job_text,
            "Trusted preflight workload identity drift")
    entry = (app / "functions/src/index.ts").read_text()
    module = (app / "functions/src/billing/sendProposalPrepaidCashReceipt.ts").read_text()
    require(re.search(r"sendProposalPrepaidCashReceipt", entry) and
            re.search(r"export const sendProposalPrepaidCashReceipt\s*=\s*onCall", module) and
            "secrets: [RESEND_API_KEY]" in module and
            "if (!req.auth)" in module and
            "stripeCheckoutSessionId" in module and
            "stripeSubscriptionId" in module, "Callable source contract drift")
    output = Path("evidence/receipt-preflight")
    output.mkdir(parents=True, exist_ok=True)
    evidence = {
        "project": PROJECT, "region": REGION, "sourceSha": SHA,
        "target": TARGET, "mode": "READ_ONLY", "deploymentAuthorized": False,
        "releaseReady": False,
        "sourceFileDigests": {
            path: hashlib.sha256((app / path).read_bytes()).hexdigest()
            for path in ("functions/src/index.ts",
                         "functions/src/billing/sendProposalPrepaidCashReceipt.ts",
                         "functions/src/modules/email/resend.ts",
                         "functions/src/proposals/proposalAccess.ts")
        },
        "sourceIsolationStatus": "NOT_YET_VERIFIED_TRANSITIVE_BUILD",
        "hostingLiveBaselineStatus": "NOT_CHECKED_BY_THIS_PREFLIGHT",
        "existingAthleteReconciliation": "NOT_YET_CERTIFIED",
        "receiptRecipientSandbox": "NOT_YET_VERIFIED",
        "targetFunction": "UNVERIFIED",
        "runtimePrincipals": {},
        "secret": {"name": "RESEND_API_KEY", "enabledVersionPresent": False},
    }
    errors = []
    try:
        functions = run_read("gcloud", "functions", "list",
                             "--regions=" + REGION, "--project=" + PROJECT, "--format=json")
        matching = [x for x in functions if str(x.get("name", "")).endswith("/functions/" + TARGET)]
        # Successful staging API response with the protected workflow's pinned
        # impersonation proves this read-only credential operates; it does not
        # prove that the principal has deploy privileges or read its own metadata.
        evidence["runtimePrincipals"][DEPLOYER] = "WORKFLOW_IDENTITY_READ_API_VERIFIED_METADATA_NOT_READ"
        if len(matching) == 0:
            evidence["targetFunction"] = "ABSENT_VERIFIED"
        elif len(matching) == 1:
            evidence["targetFunction"] = "PRESENT_STOP_REBASELINE"
            errors.append("Receipt target is already deployed; manual drift review required")
        else:
            errors.append("Unexpected duplicate target listings")
        for account in ACCOUNTS:
            try:
                principal = run_read("gcloud", "iam", "service-accounts", "describe", account,
                                     "--project=" + PROJECT, "--format=json")
                require(principal.get("email") == account and principal.get("disabled") is not True,
                        "Service account missing or disabled: " + account)
                evidence["runtimePrincipals"][account] = "EXISTS_ENABLED"
            except Exception as exc:
                # Do not report a missing account when the metadata lookup was denied.
                evidence["runtimePrincipals"][account] = "UNVERIFIED"
                errors.append("principal=" + account + " " + str(exc))
        try:
            metadata = run_read("gcloud", "secrets", "describe", "RESEND_API_KEY",
                                "--project=" + PROJECT, "--format=json")
            require(str(metadata.get("name", "")).endswith("/secrets/RESEND_API_KEY"),
                    "Secret metadata identity mismatch")
            evidence["secret"]["metadataPresent"] = True
            evidence["secret"]["metadataDigestSha256"] = digest({
                "name": metadata.get("name"), "createTime": metadata.get("createTime"),
                "replication": metadata.get("replication")})
        except Exception as exc:
            errors.append("secret.metadata " + str(exc))
        try:
            versions = run_read("gcloud", "secrets", "versions", "list", "RESEND_API_KEY",
                                "--filter=state=ENABLED", "--project=" + PROJECT, "--format=json")
            evidence["secret"]["enabledVersionPresent"] = len(versions) > 0
            require(evidence["secret"]["enabledVersionPresent"], "No enabled Resend secret version")
        except Exception as exc:
            errors.append("secret.versions " + str(exc))
        try:
            policy = run_read("gcloud", "secrets", "get-iam-policy", "RESEND_API_KEY",
                              "--project=" + PROJECT, "--format=json")
            evidence["secret"]["iamFingerprintSha256"] = digest(policy)
            evidence["secret"]["iamBindingCount"] = len(policy.get("bindings", []))
        except Exception as exc:
            errors.append("secret.iam " + str(exc))
        # A secret's IAM policy alone cannot establish effective permissions:
        # org/project inherited permissions and service agent relationships need review.
        evidence["secret"]["effectiveRuntimeAccess"] = "NOT_YET_VERIFIED"
    except Exception as exc:
        errors.append(str(exc))
    evidence["readOnlyMetadataChecksPassed"] = not errors
    evidence["errors"] = errors
    (output / "summary.json").write_text(json.dumps(evidence, indent=2) + "\n")
    if errors:
        print("2C receipt read-only preflight BLOCKED: " + "; ".join(errors), file=sys.stderr)
        return 1
    print("2C receipt read-only metadata preflight PASSED; releaseReady=false, deploymentAuthorized=false")
    return 0

if __name__ == "__main__":
    sys.exit(main())
