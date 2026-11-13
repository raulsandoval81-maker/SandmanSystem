"""Exact PR #678 staging scope using the protected Function/Hosting release."""
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

SHA = "77949da45bfd9c4f9f1e3aa514d523be54779e86"
BASE = "7656554249f2414d4081cfa1392b044e0fabfd68"
PREFLIGHT = "pr678-readonly-preflight"
DEPLOY = "pr678-staging-deploy"
APPROVAL = "APPROVE_PR678_STAGING_TWO_FUNCTIONS_THREE_ASSETS"
ROOT = Path("pr614-candidate")
RELEASE = json.loads(Path(__file__).with_name("pr678-release.json").read_text())
ENTRY_POINTS = RELEASE["functions"]
ASSETS = tuple(path.removeprefix("public") for path in RELEASE["hostingSha256"])
MANIFEST = {f"functions/src/{path}.ts" for path in ENTRY_POINTS.values()} | {
    "functions/src/enrollment/earlyCashCheckIntake.ts",
    "functions/tests/earlyCashCheckIntake.test.cjs",
    "tests/browser/enrollment-family-pathways.test.mjs",
} | set(RELEASE["hostingSha256"])


def guard(env):
    require(env.get("REQUESTED_ACTION") in (PREFLIGHT, DEPLOY), "Unexpected PR #678 action")
    for key, expected in {
        "GITHUB_REPOSITORY": inventory.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW,
        "CONFIRM_PROJECT": inventory.PROJECT,
        "CONFIRM_SHA": SHA,
    }.items():
        require(env.get(key) == expected, f"Unexpected {key}")
    if env["REQUESTED_ACTION"] == DEPLOY:
        require(env.get("DEPLOY_APPROVAL") == APPROVAL, "Missing exact PR #678 deployment approval")
        require(re.fullmatch(r"[a-f0-9]{64}", env.get("EXPECTED_BASELINE_SHA256", "")),
                "Missing approved PR #678 preflight SHA-256")


def offline():
    git = protected.git
    require(git(ROOT, "rev-parse", "HEAD") == SHA, "Candidate checkout SHA mismatch")
    require(git(ROOT, "rev-parse", "HEAD^1") == BASE, "Candidate parent SHA mismatch")
    require(set(git(ROOT, "diff", "--name-only", BASE, SHA).splitlines()) == MANIFEST,
            "Candidate changed-file manifest mismatch")
    require(not git(ROOT, "status", "--porcelain", "--untracked-files=no"), "Candidate checkout modified")
    hashes = {path: inventory.sha((ROOT / path).read_bytes()) for path in sorted(MANIFEST)}
    require(all(hashes[path] == digest for path, digest in RELEASE["hostingSha256"].items()),
            "PR #678 pinned Hosting asset hash mismatch")
    return hashes


def bind_scope():
    protected.SHA, protected.PREFLIGHT = SHA, PREFLIGHT
    protected.ENTRY_POINTS, protected.ASSETS = ENTRY_POINTS, ASSETS
    protected.EVIDENCE = Path("pr678-preflight.json")
    protected.RESULT = Path("pr678-deploy-result.json")
    protected.guard, protected.offline = guard, offline
    bind_existing_scope()


bind_existing_scope = protected.bind_scope


def run_release():
    # The inherited engine calls guard() and offline() before bind_scope().
    # Install both PR678 validators before invoking its main entrypoint.
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
        require(not sys.argv[1:], "Unexpected PR #678 release arguments")
        run_release()
