"""Protected exact-SHA Function and Hosting release for PR #622."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlencode

spec = importlib.util.spec_from_file_location("pr614_continuation",
    Path(__file__).with_name("pr614-staging-continue.py"))
continuation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(continuation)
original = continuation.original
preflight = original.preflight
release = original.release
inventory = original.inventory
require = inventory.require
PROJECT = inventory.PROJECT
SITE = inventory.SITE
SHA = "8b2c58868eaae79c9bddfdc1cd3afa9a50d72981"
BASE = "6a11aeb8d8bde6eaf919b291dade3a27dd3128e8"
PREFLIGHT = "pr622-readonly-preflight"
DEPLOY = "pr622-staging-deploy"
APPROVAL = "APPROVE_PR622_STAGING_FOUR_FUNCTIONS_FIVE_ASSETS"
EVIDENCE = Path("pr622-preflight.json")
RESULT = Path("pr622-deploy-result.json")
ROOT = Path("pr614-candidate")
ENTRY_POINTS = {
    "hydrateEnrollmentIntakePrefill": "enrollment/hydrateEnrollmentIntakePrefill",
    "acceptProposalClientReview": "proposals/acceptProposalClientReview",
    "issueProposalEnrollmentHandoff": "proposals/issueProposalEnrollmentHandoff",
    "saveProposalEnrollmentAgreement": "proposals/saveProposalEnrollmentAgreement",
}
ASSETS = (
    "/connect/enrollment/enrollment.css",
    "/connect/enrollment/enrollment.js",
    "/connect/enrollment/index.html",
    "/connect/proposals/activity/activity.js",
    "/management/pipeline-history/activity/index.html",
)
# The helper has four deployed callable consumers; it is not itself a Function.
SUPPORT = {
    "functions/src/enrollment/earlyCashCheckIntake.ts",
    "functions/tests/earlyCashCheckIntake.test.cjs",
    "tests/browser/enrollment-activity-pathways.test.mjs",
    "tests/browser/enrollment-family-pathways.test.mjs",
}
MANIFEST = {f"functions/src/{path}.ts" for path in ENTRY_POINTS.values()} | {
    "public" + path for path in ASSETS
} | SUPPORT


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()


def offline():
    require(git(ROOT, "rev-parse", "HEAD") == SHA, "Candidate checkout SHA mismatch")
    require(git(ROOT, "rev-parse", "HEAD^") == BASE, "Candidate parent SHA mismatch")
    require(len(MANIFEST) == 13 and set(git(ROOT, "diff", "--name-only", BASE, SHA).splitlines()) == MANIFEST,
            "Candidate changed-file manifest mismatch")
    require(not git(ROOT, "status", "--porcelain", "--untracked-files=no"), "Candidate checkout modified")
    return {path: inventory.sha((ROOT / path).read_bytes()) for path in sorted(MANIFEST)}


def guard(env):
    action = env.get("REQUESTED_ACTION")
    require(action in (PREFLIGHT, DEPLOY), "Unexpected REQUESTED_ACTION")
    for key, expected in {
        "GITHUB_REPOSITORY": inventory.REPO, "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW, "CONFIRM_PROJECT": PROJECT, "CONFIRM_SHA": SHA,
    }.items():
        require(env.get(key) == expected, f"Unexpected {key}")
    if action == DEPLOY:
        require(env.get("DEPLOY_APPROVAL") == APPROVAL, "Missing exact PR #622 deployment approval")
        require(re.fullmatch(r"[a-f0-9]{64}", env.get("EXPECTED_BASELINE_SHA256", "")),
                "Missing approved preflight SHA-256")


def bind_scope():
    functions = {name: 2 for name in ENTRY_POINTS}
    preflight.SHA, preflight.ACTION = SHA, os.environ["REQUESTED_ACTION"]
    preflight.FUNCTIONS = {name: (2, path) for name, path in ENTRY_POINTS.items()}
    preflight.MARKED = set(ENTRY_POINTS)
    preflight.ASSETS, preflight.offline = ASSETS, offline
    preflight.REQUIREMENTS = {key: value for key, value in preflight.REQUIREMENTS.items() if key != "rules"}
    inventory.TARGET = ASSETS[0]
    original.FUNCTIONS = release.FUNCTIONS = functions
    original.ASSETS = ASSETS
    original.SHA = SHA
    original.ENTRY_POINTS = {name: f"lib/{path}.js" for name, path in ENTRY_POINTS.items()}
    original.guard = guard


def check_baseline(evidence, digest):
    require(not evidence.get("errors") and evidence.get("project") == PROJECT and
            evidence.get("applicationSha") == SHA and set(evidence.get("functions", {})) == set(ENTRY_POINTS),
            "Preflight did not pass for the exact release")
    require(digest == os.environ["EXPECTED_BASELINE_SHA256"], "Approved preflight baseline changed")
    hosting = evidence["hostingRollback"]
    require(set(hosting["changedPaths"]) == set(ASSETS), "Unexpected Hosting scope")
    return hosting


def main():
    guard(os.environ)
    offline()
    bind_scope()
    require(preflight.live(include_rules=False, output=EVIDENCE) == 0, "Read-only staging preflight failed")
    raw = EVIDENCE.read_bytes()
    digest = inventory.sha(raw)
    print(json.dumps({"preflightSha256": digest, "project": PROJECT, "applicationSha": SHA}), flush=True)
    if os.environ["REQUESTED_ACTION"] == PREFLIGHT:
        return
    evidence = json.loads(raw)
    hosting = check_baseline(evidence, digest)
    archive = Path(os.environ["CANDIDATE_PACKAGE"]).read_bytes()
    inventory.archive_evidence(archive)
    token = inventory.command("Acquire staging Function credentials",
                               ["gcloud", "auth", "print-access-token"]).decode().strip()
    host_token = inventory.hosting_access_token(os.environ)
    live = {name: release.function_config(name, token) for name in ENTRY_POINTS}
    for name, config in live.items():
        continuation.verify_snapshot(name, config, evidence["functions"][name])
    first = (ROOT / ("public" + ASSETS[0])).read_bytes()

    def verify_active():
        current = original.current_hosting(host_token, first)
        require(all(current[key] == hosting[key] for key in ("release", "version", "manifest", "config")),
                "Active Hosting baseline changed")

    verify_active()
    version, manifest = original.prepare_hosting(hosting, host_token)
    require(manifest == hosting["proposed"], "Prepared Hosting manifest differs from preflight")
    original.verify_hosting_version(version, hosting["config"], manifest, host_token)
    attempted, revisions = [], {}
    published = None
    try:
        for name in ENTRY_POINTS:
            require(release.function_config(name, token) == live[name], f"{name}: changed since preflight")
            attempted.append(name)
            release.source_update(name, archive, token)
            after = release.function_config(name, token)
            require(original.preserved_runtime_config(after) == original.preserved_runtime_config(live[name]),
                    f"{name}: runtime, IAM, secret bindings, or transport changed")
            continuation.verify_deployed_archive(name, original.deployed_source(name, after, token), archive)
            revision = continuation.expected_revision(name, after)
            require(revision != continuation.expected_revision(name, live[name]), f"{name}: revision did not advance")
            revisions[name] = revision
        verify_active()
        published = original.write("Publish approved Hosting overlay",
            original.HOSTING_API + SITE + "/releases?" + urlencode({"versionName": version}),
            "POST", {}, host_token)["name"]
        active = original.get("Verify active Hosting",
            original.HOSTING_API + SITE + "/releases?pageSize=1", host_token)["releases"][0]
        require(active["name"] == published and active["version"]["name"] == version,
                "Approved Hosting version is not active")
        original.verify_hosting_version(version, hosting["config"], manifest, host_token)
        for path in ASSETS:
            body = inventory.read("Verify live approved Hosting asset",
                f"https://{PROJECT}.web.app{path}?" + urlencode({"release": published}))
            require(inventory.sha(body) == evidence["candidateHashes"]["public" + path],
                    f"Live Hosting asset differs: {path}")
    finally:
        RESULT.write_text(json.dumps({"applicationSha": SHA, "attemptedFunctions": attempted,
            "verifiedRevisions": revisions, "hostingVersion": version, "hostingRelease": published,
            "rollbackVersion": hosting["version"], "preflightSha256": digest}, indent=2) + "\n")


if __name__ == "__main__":
    if sys.argv[1:] == ["--offline"]:
        print(json.dumps(offline(), indent=2, sort_keys=True))
    elif sys.argv[1:] == ["--guard-only"]:
        guard(os.environ)
    elif sys.argv[1:] == ["--package"]:
        guard(os.environ)
        require(os.environ["REQUESTED_ACTION"] == DEPLOY, "Packaging requires deployment action")
        offline()
        bind_scope()
        original.package()
    else:
        require(not sys.argv[1:], "Unexpected release arguments")
        main()
