#!/usr/bin/env python3
"""Read-only 2C receipt staging runtime/rollback review; NEVER authorizes deploy."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

PROJECT = "sandman-combat-staging"
TARGET = "sendProposalPrepaidCashReceipt"
RUNTIME = "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com"
SHA = "b4b40798b58aac46706dce984427e77d501855e7"
NEIGHBORS = ("recordProposalPrepaidCash", "sendEnrollmentIntakeEmail",
             "issueProposalEnrollmentHandoff", "approveAndActivate")
ALLOWED = {
    ("gcloud", "functions", "list"),
    ("gcloud", "secrets", "get-iam-policy"),
    ("gcloud", "projects", "get-iam-policy"),
}
def check(ok, reason):
    if not ok:
        raise RuntimeError(reason)

def digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def read(*cmd):
    check(any(cmd[:len(prefix)] == prefix for prefix in ALLOWED), "COMMAND_NOT_ALLOWLISTED")
    check("--project=" + PROJECT in cmd, "PROJECT_SCOPE_DRIFT")
    response = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    if response.returncode:
        # Do not expose cloud stderr, resource names beyond pinned allowlist, or credentials.
        message = response.stderr.lower()
        category = ("PERMISSION_DENIED" if re.search(r"permission.denied|permission denied|forbidden|\\b403\\b",message)
                    else "NOT_FOUND" if re.search(r"not found|\\b404\\b", message)
                    else "UNKNOWN")
        raise RuntimeError("READ_QUERY_" + category + "_FINGERPRINT_" +
                           hashlib.sha256(response.stderr.encode()).hexdigest()[:12])
    return json.loads(response.stdout)

def policy_evidence(policy):
    direct = []
    conditional = False
    for binding in policy.get("bindings", []):
        if binding.get("role") != "roles/secretmanager.secretAccessor":
            continue
        if "serviceAccount:" + RUNTIME in binding.get("members", []):
            if binding.get("condition"):
                conditional = True
            else:
                direct.append("UNCONDITIONAL_DIRECT_BINDING")
    return {"fingerprintSha256": digest(policy),
            "unconditionalSecretAccessorBinding": bool(direct),
            "conditionalBindingPresent": conditional}

def main():
    expected = {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main",
        "CONFIRM_PROJECT": PROJECT,
        "REQUESTED_ACTION": "emmett-2c-runtime-rollback-readonly",
    }
    for field, value in expected.items():
        check(os.environ.get(field) == value, "PROTECTED_WORKFLOW_GUARD_" + field)
    root, app = Path("trusted-tooling"), Path("application")
    plan = json.loads((root / "scripts/staging/emmett-2c-receipt-package-security-review.json").read_text())
    check(plan["pinnedApplicationSha"] == SHA and plan["targetFunction"] == TARGET and
          plan["authorization"]["deploymentAuthorized"] is False and
          all(value is False for value in plan["authorization"].values()), "REVIEW_ONLY_PLAN_GUARD")
    actual_sha = subprocess.check_output(["git", "-C", str(app), "rev-parse", "HEAD"],text=True).strip()
    check(actual_sha == SHA, "IMMUTABLE_SOURCE_DRIFT")
    source = (app / "functions/src/billing/sendProposalPrepaidCashReceipt.ts").read_text()
    staff = (app / "functions/src/proposals/proposalAccess.ts").read_text()
    checks = {
        "firebaseCallableAuth": "if (!req.auth)" in source,
        "staffGate": "requireProposalStaffAccess(req.auth.uid)" in source,
        "locationGate": "requireProposalLocationAccess(actor, proposal.locationId)" in source,
        "paymentAuthority": "cashPrepayment" in source,
        "noStripeReceipts": "stripeCheckoutSessionId" in source and "stripeSubscriptionId" in source,
        "uncertainProviderHandling": "SENDING" in source,
        "staffActiveStatus": 'status !== "active"' in staff,
    }
    # Text-contract checks are NOT executable authorization proof.
    result = {
        "mode": "READ_ONLY", "project": PROJECT, "sourceSha": SHA,
        "target": TARGET, "deploymentAuthorized": False, "releaseReady": False,
        "transportAuthorization": "NOT_PROVEN_BY_SOURCE_CHECKS",
        "effectiveSecretAccess": "NOT_PROVEN_BY_POLICY_READ",
        "realRecipientSafety": "NOT_CERTIFIED_BLOCKS_STAGING_EMAIL",
        "hostingBaseline": "NOT_CAPTURED_BY_THIS_WORKFLOW",
        "existingAthleteIdentity": "NOT_CERTIFIED",
        "sourceChecks": checks, "cloudReads": {},
        "baseline": {"target": "UNVERIFIED", "neighborFunctions": {}, "rollback":
                     "NEW_FUNCTION_DELETE_ONLY_WITH_SEPARATE_APPROVAL"},
        "blockers": [], "queryErrors": [],
    }
    if not all(checks.values()):
        result["blockers"].append("SOURCE_AUTH_OR_PAYMENT_GUARD_DRIFT")
    try:
        functions = read("gcloud", "functions", "list", "--regions=us-central1",
                         "--project=" + PROJECT, "--format=json")
        observed = {}
        for f in functions:
            name = str(f.get("name", "")).rsplit("/", 1)[-1]
            if name == TARGET or name in NEIGHBORS:
                # Record only a digest of the returned state; never publish environment variables.
                observed[name] = digest(f)
        result["baseline"]["target"] = "ABSENT" if TARGET not in observed else "PRESENT_STOP"
        result["baseline"]["neighborFunctions"] = {name: {"present":name in observed,
                                                            "metadataSha256":observed.get(name)}
                                                  for name in NEIGHBORS}
        result["cloudReads"]["functionsListed"] = True
        if result["baseline"]["target"] != "ABSENT":
            result["blockers"].append("TARGET_EXISTS_REBASELINE_REQUIRED")
        if any(n not in observed for n in NEIGHBORS):
            result["blockers"].append("NEIGHBOR_BASELINE_INCOMPLETE")
    except Exception as error:
        result["queryErrors"].append("functions: " + str(error))
    try:
        secret = read("gcloud","secrets","get-iam-policy","RESEND_API_KEY",
                      "--project=" + PROJECT,"--format=json")
        result["cloudReads"]["secretPolicy"] = policy_evidence(secret)
        if not result["cloudReads"]["secretPolicy"]["unconditionalSecretAccessorBinding"]:
            result["blockers"].append("DIRECT_SECRET_BINDING_NOT_ESTABLISHED")
    except Exception as error:
        result["queryErrors"].append("secret-policy: " + str(error))
    try:
        project = read("gcloud","projects","get-iam-policy",PROJECT,
                       "--project=" + PROJECT,"--format=json")
        result["cloudReads"]["projectPolicySha256"] = digest(project)
        result["cloudReads"]["projectPolicyRead"] = True
    except Exception as error:
        result["queryErrors"].append("project-policy: " + str(error))
    result["blockers"].extend(["EFFECTIVE_SECRET_ACCESS_UNPROVEN",
                                "STAGING_RECIPIENT_SANDBOX_NOT_ENFORCED",
                                "CALLABLE_TRANSPORT_IAM_NOT_VERIFIED",
                                "HOSTING_AND_FULL_ROLLBACK_BASELINE_PENDING",
                                "EXISTING_ATHLETE_RECONCILIATION_UNCERTIFIED"])
    output=Path("evidence/receipt-runtime-rollback")
    output.mkdir(parents=True,exist_ok=True)
    result["cloudQueriesCompleted"] = not result["queryErrors"]
    (output / "summary.json").write_text(json.dumps(result,indent=2)+"\n")
    if result["queryErrors"] or not all(checks.values()) or result["baseline"]["target"] != "ABSENT":
        print("2C read-only runtime review BLOCKED: queries/source/target check incomplete",file=sys.stderr)
        return 1
    print("2C runtime/rollback evidence captured; RELEASE NOT READY; deploymentAuthorized=false")
    return 0

if __name__ == "__main__":
    sys.exit(main())
