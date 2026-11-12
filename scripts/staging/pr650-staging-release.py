"""Exact PR #650 staging scope using the protected Function/Hosting release."""
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

SHA = "335be5278aabe3a8e17a541b934cd3261592fc85"
BASE = "11503232f6a823d7b8a2122bcc6aa47fbe0455d5"
PREFLIGHT = "pr650-readonly-preflight"
DEPLOY = "pr650-staging-deploy"
APPROVAL = "APPROVE_PR650_STAGING_TWO_FUNCTIONS_TWO_ASSETS"
ROOT = Path("pr614-candidate")
ENTRY_POINTS = {
    "createProposalDraft": "proposals/createProposalDraft",
    "recordProposalPrepaidCash": "billing/recordProposalPrepaidCash",
}
ASSETS = (
    "/connect/proposals/index.html",
    "/connect/proposals/proposals.js",
)
MANIFEST = {
    "functions/src/billing/prepaidConversionPolicy.ts",
    "functions/src/billing/recordProposalPrepaidCash.ts",
    "tests/functions/manual-edge-case-proposal.test.mjs",
} | {"public" + path for path in ASSETS}


def guard(env):
    require(env.get("REQUESTED_ACTION") in (PREFLIGHT, DEPLOY), "Unexpected PR #650 action")
    for key, expected in {
        "GITHUB_REPOSITORY": inventory.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW,
        "CONFIRM_PROJECT": inventory.PROJECT,
        "CONFIRM_SHA": SHA,
    }.items():
        require(env.get(key) == expected, f"Unexpected {key}")
    if env["REQUESTED_ACTION"] == DEPLOY:
        require(env.get("DEPLOY_APPROVAL") == APPROVAL, "Missing exact PR #650 deployment approval")
        require(re.fullmatch(r"[a-f0-9]{64}", env.get("EXPECTED_BASELINE_SHA256", "")),
                "Missing approved PR #650 preflight SHA-256")


def offline():
    git = protected.git
    require(git(ROOT, "rev-parse", "HEAD") == SHA, "Candidate checkout SHA mismatch")
    require(git(ROOT, "rev-parse", "HEAD^^1") == BASE, "Candidate parent SHA mismatch")
    require(set(git(ROOT, "diff", "--name-only", BASE, SHA).splitlines()) == MANIFEST,
            "Candidate changed-file manifest mismatch")
    require(not git(ROOT, "status", "--porcelain", "--untracked-files=no"), "Candidate checkout modified")
    return {path: inventory.sha((ROOT / path).read_bytes()) for path in sorted(MANIFEST)}


def bind_scope():
    protected.SHA, protected.PREFLIGHT = SHA, PREFLIGHT
    protected.ENTRY_POINTS, protected.ASSETS = ENTRY_POINTS, ASSETS
    protected.EVIDENCE = Path("pr650-preflight.json")
    protected.RESULT = Path("pr650-deploy-result.json")
    protected.guard, protected.offline = guard, offline
    bind_existing_scope()
    # These callables do not use the early-Intake markers. Source-only updates
    # still compare their complete preserved runtime configuration.
    protected.preflight.MARKED = set()


bind_existing_scope = protected.bind_scope


def run_release():
    # The inherited engine calls guard() and offline() before bind_scope().
    # Install both PR650 validators before invoking its main entrypoint.
    protected.guard = guard
    protected.offline = offline
    protected.bind_scope = bind_scope
    protected.main()


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
        require(not sys.argv[1:], "Unexpected PR #650 release arguments")
        run_release()
