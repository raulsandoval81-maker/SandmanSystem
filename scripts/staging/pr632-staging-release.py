"""Exact PR #632 staging scope using the protected Function/Hosting release."""
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

SHA = "6da9769d6aa7c9bfc8472ad6c4311805128e92d9"
BASE = "4296b885527db5f43efb308ed373e3ac83d90112"
PREFLIGHT = "pr632-readonly-preflight"
DEPLOY = "pr632-staging-deploy"
APPROVAL = "APPROVE_PR632_STAGING_FOUR_FUNCTIONS_THREE_ASSETS"
ROOT = Path("pr614-candidate")
ENTRY_POINTS = {
    "createProposalDraft": "proposals/createProposalDraft",
    "updateProposalDraft": "proposals/updateProposalDraft",
    "issueProposalClientReview": "proposals/issueProposalClientReview",
    "recordProposalPrepaidCash": "billing/recordProposalPrepaidCash",
}
ASSETS = (
    "/connect/admissions/calculator/calculator.js",
    "/connect/admissions/calculator/payment-arrangement.js",
    "/connect/proposals/review/review.js",
)
MANIFEST = {
    "functions/src/billing/paymentArrangement.ts",
    "functions/src/billing/recordProposalPrepaidCash.ts",
    "functions/tests/paymentArrangement.test.cjs",
    "tests/browser/payment-arrangement.test.mjs",
    "tests/browser/prepaid-builder-preview.test.mjs",
} | {"public" + path for path in ASSETS}


def guard(env):
    require(env.get("REQUESTED_ACTION") in (PREFLIGHT, DEPLOY), "Unexpected PR #632 action")
    for key, expected in {
        "GITHUB_REPOSITORY": inventory.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW,
        "CONFIRM_PROJECT": inventory.PROJECT,
        "CONFIRM_SHA": SHA,
    }.items():
        require(env.get(key) == expected, f"Unexpected {key}")
    if env["REQUESTED_ACTION"] == DEPLOY:
        require(env.get("DEPLOY_APPROVAL") == APPROVAL, "Missing exact PR #632 deployment approval")
        require(re.fullmatch(r"[a-f0-9]{64}", env.get("EXPECTED_BASELINE_SHA256", "")),
                "Missing approved PR #632 preflight SHA-256")


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
    protected.EVIDENCE = Path("pr632-preflight.json")
    protected.RESULT = Path("pr632-deploy-result.json")
    protected.guard, protected.offline = guard, offline
    bind_existing_scope()
    # These callables do not use the early-Intake markers. Source-only updates
    # still compare their complete preserved runtime configuration.
    protected.preflight.MARKED = set()


bind_existing_scope = protected.bind_scope


def run_release():
    # The inherited engine calls guard() and offline() before bind_scope().
    # Install both PR632 validators before invoking its main entrypoint.
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
        require(not sys.argv[1:], "Unexpected PR #632 release arguments")
        run_release()
