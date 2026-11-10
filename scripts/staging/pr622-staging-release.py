"""Protected exact-SHA Function and Hosting release for PR #622."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import gzip
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
VERIFY = "pr622-postdeploy-verify"
APPROVAL = "APPROVE_PR622_STAGING_FOUR_FUNCTIONS_FIVE_ASSETS"
EVIDENCE = Path("pr622-preflight.json")
RESULT = Path("pr622-deploy-result.json")
RECOVERY = Path("pr622-recovery-result.json")
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
    require(action in (PREFLIGHT, DEPLOY, VERIFY), "Unexpected REQUESTED_ACTION")
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


# Immutable evidence recorded by the failed, partially completed staging run #357.
# Recovery is read-only: never call source_update, prepare_hosting, or write.
RECOVERY_RELEASE = "sites/sandman-combat-staging/releases/1794346535116000"
RECOVERY_VERSION = "sites/sandman-combat-staging/versions/47353efb145a2546"
RECOVERY_REVISIONS = {
    "hydrateEnrollmentIntakePrefill": "00004-dod",
    "acceptProposalClientReview": "00006-vor",
    "issueProposalEnrollmentHandoff": "00004-fer",
    "saveProposalEnrollmentAgreement": "00005-juh",
}
RECOVERY_MANIFEST_SHA256 = "2912409e791c58c0c1a111ad740c2ba6ac3532a575ad1dc73c50fb59ca525a73"
RECOVERY_CONFIG_SHA256 = "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a"


def canonical_sha(value):
    return inventory.sha(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def verify_postdeploy():
    """Read only; requires the recorded release, exact source, and all live assets."""
    offline()
    bind_scope()
    require(os.environ["REQUESTED_ACTION"] == VERIFY, "Recovery verification action only")
    require(not os.environ.get("DEPLOY_APPROVAL"), "No deployment approval in read-only verification")
    archive = Path(os.environ["CANDIDATE_PACKAGE"]).read_bytes()
    inventory.archive_evidence(archive)
    token = inventory.command("Acquire staging Function credentials",
                              ["gcloud", "auth", "print-access-token"]).decode().strip()
    host_token = inventory.hosting_access_token(os.environ)
    revisions = {}
    for name in ENTRY_POINTS:
        config = release.function_config(name, token)
        revision = continuation.expected_revision(name, config)
        require(revision == RECOVERY_REVISIONS[name],
                f"{name}: deployed revision differs from recorded partial release")
        continuation.verify_deployed_archive(
            name, original.deployed_source(name, config, token), archive)
        revisions[name] = revision

    active_url = original.HOSTING_API + SITE + "/releases?pageSize=1"
    active = original.get("Read current staging Hosting release", active_url, host_token)["releases"]
    require(len(active) == 1 and active[0]["name"] == RECOVERY_RELEASE and
            active[0]["version"]["name"] == RECOVERY_VERSION,
            "Active Hosting release differs from recorded partial release")
    version_url = original.HOSTING_API + RECOVERY_VERSION
    version_record = original.get("Read finalized Hosting version", version_url, host_token)
    require(version_record["status"] == "FINALIZED" and
            canonical_sha(version_record["config"]) == RECOVERY_CONFIG_SHA256,
            "Hosting configuration differs from recorded release")

    manifest, cursor, tokens = {}, "", set()
    while True:
        query = urlencode({"pageSize": 1000, **({"pageToken": cursor} if cursor else {})})
        page = original.get("Read current Hosting manifest", version_url + "/files?" + query, host_token)
        for file in page["files"]:
            require(file["path"] not in manifest and file["status"] == "ACTIVE",
                    "Unexpected Hosting file entry")
            manifest[file["path"]] = file["hash"]
        cursor = page.get("nextPageToken", "")
        if not cursor:
            break
        require(cursor not in tokens, "Repeated Hosting pagination token")
        tokens.add(cursor)
    require(canonical_sha(manifest) == RECOVERY_MANIFEST_SHA256,
            "Active Hosting manifest does not match approved 5-asset overlay")

    checks = {}
    for path in ASSETS:
        expected = inventory.sha((ROOT / ("public" + path)).read_bytes())
        found = []
        # Bounded read-only CDN propagation check; no deployment retry.
        for attempt in range(3):
            nonce = f"{RECOVERY_RELEASE.rsplit('/', 1)[-1]}-verify-{attempt}"
            url = f"https://{PROJECT}.web.app{path}?" + urlencode({"pr622Verification": nonce})
            body = inventory.read("Read live approved Hosting asset", url)
            if body[:2] == b"\x1f\x8b":
                body = gzip.decompress(body)
            digest = inventory.sha(body)
            found.append(digest)
            if digest == expected:
                break
            if attempt < 2:
                time.sleep(3)
        checks[path] = {"expectedSha256": expected, "observedSha256": found[-1],
                        "matches": found[-1] == expected}
    result = {"applicationSha": SHA, "mode": "READ_ONLY",
              "hostingRelease": RECOVERY_RELEASE, "hostingVersion": RECOVERY_VERSION,
              "verifiedRevisions": revisions, "hostingManifestVerified": True,
              "assets": checks, "passed": all(x["matches"] for x in checks.values())}
    RECOVERY.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    require(result["passed"], "Live Hosting asset hashes remain different; stop without redeploying")
    print(json.dumps({"status": "VERIFIED", "mode": "READ_ONLY",
                      "hostingRelease": RECOVERY_RELEASE, "verifiedAssets": len(checks)}))


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
        require(os.environ["REQUESTED_ACTION"] in (DEPLOY, VERIFY), "Packaging requires deployment or read-only recovery action")
        offline()
        bind_scope()
        original.package()
    else:
        require(not sys.argv[1:], "Unexpected release arguments")
        if os.environ.get("REQUESTED_ACTION") == VERIFY:
            guard(os.environ)
            verify_postdeploy()
        else:
            main()
