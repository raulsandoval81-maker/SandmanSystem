"""Exact Edge Case Paid-in-Full staging scope using the protected Function/Hosting release."""
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

spec = importlib.util.spec_from_file_location(
    "protected_staging_release", Path(__file__).with_name("pr622-staging-release.py")
)
protected = importlib.util.module_from_spec(spec)
spec.loader.exec_module(protected)
inventory = protected.inventory
require = inventory.require

SHA = "45808357791e2523f80f68ca74e82663d0252a12"
BASE = "64a2d483b06a1d74d1c6c7f9d2ad3d08d7fce757"
PREFLIGHT = "edge-case-pif-readonly-preflight"
DEPLOY = "edge-case-pif-staging-deploy"
APPROVAL = "APPROVE_EDGE_CASE_PIF_STAGING_TWO_FUNCTIONS_TWO_ASSETS"
ROOT = Path("pr614-candidate")
ENTRY_POINTS = {
    "manualEdgeCaseProposal": "management/manualEdgeCaseProposal",
    "recordProposalPrepaidCash": "billing/recordProposalPrepaidCash",
}
ASSETS = (
    "/management/manual-edge-case-proposal/index.html",
    "/management/manual-edge-case-proposal/tool.js",
)
MANIFEST = {
    "functions/src/billing/prepaidConversionPolicy.ts",
    "functions/src/billing/recordProposalPrepaidCash.ts",
    "functions/src/management/manualEdgeCaseProposal.ts",
    "functions/src/management/manualEdgeCaseProposalPolicy.ts",
    "functions/tests/manualEdgeCaseProposal.integration.cjs",
    "tests/functions/manual-edge-case-proposal.test.mjs",
} | {"public" + path for path in ASSETS}


def guard(env):
    require(env.get("REQUESTED_ACTION") in (PREFLIGHT, DEPLOY), "Unexpected Edge Case Paid-in-Full action")
    for key, expected in {
        "GITHUB_REPOSITORY": inventory.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW,
        "CONFIRM_PROJECT": inventory.PROJECT,
        "CONFIRM_SHA": SHA,
    }.items():
        require(env.get(key) == expected, f"Unexpected {key}")
    if env["REQUESTED_ACTION"] == DEPLOY:
        require(env.get("DEPLOY_APPROVAL") == APPROVAL, "Missing exact Edge Case Paid-in-Full deployment approval")
        require(re.fullmatch(r"[a-f0-9]{64}", env.get("EXPECTED_BASELINE_SHA256", "")),
                "Missing approved Edge Case Paid-in-Full preflight SHA-256")


def offline():
    git = protected.git
    require(git(ROOT, "rev-parse", "HEAD") == SHA, "Candidate checkout SHA mismatch")
    require(git(ROOT, "rev-parse", "HEAD^") == BASE, "Candidate parent SHA mismatch")
    require(set(git(ROOT, "diff", "--name-only", BASE, SHA).splitlines()) == MANIFEST,
            "Candidate changed-file manifest mismatch")
    require(not git(ROOT, "status", "--porcelain", "--untracked-files=no"), "Candidate checkout modified")
    return {path: inventory.sha((ROOT / path).read_bytes()) for path in sorted(MANIFEST)}


def bind_scope():
    protected.SHA, protected.PREFLIGHT = SHA, PREFLIGHT
    protected.ENTRY_POINTS, protected.ASSETS = ENTRY_POINTS, ASSETS
    protected.EVIDENCE = Path("edge-case-pif-preflight.json")
    protected.RESULT = Path("edge-case-pif-deploy-result.json")
    protected.guard, protected.offline = guard, offline
    bind_existing_scope()


bind_existing_scope = protected.bind_scope


# Immutable recovery evidence from staging runs 43100754172 and 43101701015.
RECOVERY_FUNCTION = "manualEdgeCaseProposal"
RECOVERY_REVISION = "projects/sandman-combat-staging/locations/us-central1/services/manualedgecaseproposal/revisions/manualedgecaseproposal-00001-lin"
RECOVERY_RUNTIME_SHA256 = "8b25f2b14ee4d2497816c67eee2406cf7a9680b8df2bd376ae78e977e1c7d317"
CONTINUATION_REVISION = "projects/sandman-combat-staging/locations/us-central1/services/manualedgecaseproposal/revisions/manualedgecaseproposal-00003-lix"
RECOVERY_HOSTING_VERSION = "sites/sandman-combat-staging/versions/166107f2285d89dd"


def verify_existing(live, evidence, archive, token):
    require(evidence["hostingRollback"]["version"] == RECOVERY_HOSTING_VERSION,
            "Original Edge Case Hosting rollback baseline changed")
    entry = evidence["functions"][RECOVERY_FUNCTION]
    require(entry["rollbackRevision"] == CONTINUATION_REVISION,
            "Unexpected active Edge Case Function revision")
    snapshot = {"function": entry["configuration"], "transport": {
        "functions": entry["iam"], "run": entry["run"], "runIam": entry["runIam"],
    }}
    runtime = protected.original.preserved_runtime_config(snapshot)
    template = runtime["transport"]["run"]["template"]
    # This exact client tag is platform metadata on the verified revision.
    if template.get("client") == "gcloud":
        template.pop("client")
    digest = inventory.sha(json.dumps(runtime, sort_keys=True, separators=(",", ":")).encode())
    require(digest == RECOVERY_RUNTIME_SHA256, "Edge Case Function runtime differs from original baseline")
    rollback = protected.preflight.get("Original Edge Case rollback revision",
                                       "https://run.googleapis.com/v2/" + RECOVERY_REVISION, token)
    require(rollback["name"] == RECOVERY_REVISION, "Original Edge Case rollback revision unavailable")
    deployed = protected.original.deployed_source(RECOVERY_FUNCTION, live[RECOVERY_FUNCTION], token)
    protected.continuation.verify_deployed_archive(RECOVERY_FUNCTION, deployed, archive)
    return {RECOVERY_FUNCTION: protected.continuation.expected_revision(
        RECOVERY_FUNCTION, live[RECOVERY_FUNCTION])}


def run_release():
    # The inherited engine calls guard() and offline() before bind_scope().
    # Install both EDGE_CASE_PIF validators before invoking its main entrypoint.
    protected.guard = guard
    protected.offline = offline
    protected.bind_scope = bind_scope
    protected.main(verify_existing=verify_existing)


if __name__ == "__main__":
    guard(os.environ)
    if sys.argv[1:] == ["--guard-only"]:
        sys.exit(0)
    if sys.argv[1:] == ["--offline"]:
        print(json.dumps(offline(), indent=2, sort_keys=True))
    elif sys.argv[1:] == ["--package"]:
        require(os.environ["REQUESTED_ACTION"] == DEPLOY, "Packaging is deploy-only")
        offline()
        bind_scope()
        protected.original.package()
    else:
        require(not sys.argv[1:], "Unexpected Edge Case Paid-in-Full release arguments")
        run_release()
