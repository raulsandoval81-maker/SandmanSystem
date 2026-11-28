#!/usr/bin/env python3
"""Command Center #862 read-only staging inventory and release-candidate assessment.

No cloud mutation, no IAM grants, no customer data reads and no deployment.
This deliberately blocks on unrelated staging drift while Athlete Sprint 1 is
still partial. It is NOT an authorization to deploy Command Center.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PROJECT = "sandman-combat-staging"
REPO = "raulsandoval81-maker/SandmanSystem"
MERGED_SHA = "c7f6181915a0c4ae351f3db88cf99e70dbc4135a"
WORKFLOW_REF = REPO + "/.github/workflows/staging-exact-sha-release.yml@refs/heads/main"
ACTION = "command-center-862-readonly-preflight"
OUT = Path("command-center-862-readonly-evidence.json")
FUNCTIONS = ("getCommandCenterSnapshot", "saveCommandCenterProject", "archiveCommandCenterProject")
HOSTING = (
    "/admin/command-center/command-center.css",
    "/admin/command-center/command-center.js",
    "/admin/command-center/command-center.service.js",
    "/admin/command-center/index.html",
    "/admin/hub/dashboard.html",
    "/assets/js/admin-nav.js",
    "/assets/js/admin-owner-guard.js",
)
CHANGED = (
    "firestore.rules",
    "functions/src/admin/commandCenter.ts",
    "functions/src/admin/commandCenterPolicy.ts",
    "functions/src/index.ts",
    "functions/tests/commandCenterPolicy.test.cjs",
    *(("public" + p) for p in HOSTING),
    "tests/emulator/command-center.e2e.test.mjs",
    "tests/firestore/command-center.rules.test.mjs",
    "tests/functions/command-center-v1.test.mjs",
)
FIRESTORE_API = f"https://firebaserules.googleapis.com/v1/projects/{PROJECT}/"
HOSTING_API = f"https://firebasehosting.googleapis.com/v1beta1/sites/{PROJECT}/"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args], stderr=subprocess.DEVNULL)


def guard():
    expected = {
        "GITHUB_REPOSITORY": REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_WORKFLOW_REF": WORKFLOW_REF,
        "GITHUB_RUN_ATTEMPT": "1",
        "CONFIRM_PROJECT": PROJECT,
        "COMMAND_CENTER_ACTION": ACTION,
    }
    for key, value in expected.items():
        require(os.environ.get(key) == value, "Trusted read-only dispatch mismatch: " + key)
    require(not os.environ.get("COMMAND_CENTER_APPROVAL"),
            "Read-only Command Center preflight cannot receive deployment approval")


def source():
    require(subprocess.run(["git", "-C", str(ROOT), "merge-base", "--is-ancestor",
                            MERGED_SHA, "HEAD"], check=False).returncode == 0,
            "Reviewed #862 merge no longer an ancestor")
    fingerprints = {}
    for p in CHANGED:
        reviewed = git("show", MERGED_SHA + ":" + p)
        current = (ROOT / p).read_bytes()
        require(current == reviewed, "Command Center reviewed source drift: " + p)
        fingerprints[p] = sha(current)
    require(len(CHANGED) == 15 and len(set(CHANGED)) == 15,
            "Command Center source allowlist drift")
    return fingerprints


def load_snapshot():
    path = ROOT / "scripts/staging/athlete-sprint1-readonly-preflight.py"
    spec = importlib.util.spec_from_file_location("cc_staging_snapshot", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def baseline():
    m = json.loads((ROOT / "scripts/staging/athlete-sprint1-release/release-manifest.json").read_text())
    raw = Path(os.environ["SPRINT1_BASELINE_JSON"]).read_bytes()
    require(sha(raw) == m["preflight"]["evidenceSha256"],
            "Signed original staging baseline mismatch")
    b = json.loads(raw)
    require(b["status"] == "PASS_READ_ONLY" and b["snapshot"]["project"] == PROJECT,
            "Unexpected baseline provenance")
    return b["snapshot"]


def rules_candidate(live_source, reviewed):
    """In-memory additive Rules candidate, never activated or deployed."""
    start = "    /* --------------------------------------\n       Owner Command Center (server-only)\n"
    anchor = "    /* --------------------------------------\n       DEFAULT CLOSED\n"
    require(reviewed.count(start) == 1 and reviewed.count(anchor) == 1,
            "Reviewed Command Center rule anchors changed")
    part = reviewed[reviewed.index(start):reviewed.index(anchor, reviewed.index(start))]
    require(part.count("match /adminCommandCenterProjects/{projectId}") == 1
            and part.count("allow read, write: if false;") == 2
            and "allow read, write: if true;" not in part
            and "match /history/{historyId}" in part,
            "Server-only Command Center rule contract changed")
    require(live_source.count(anchor) == 1
            and "match /adminCommandCenterProjects/{projectId}" not in live_source,
            "Live staging Firestore rules unexpected or already contain Command Center")
    candidate = live_source.replace(anchor, part + anchor, 1)
    require(candidate.replace(part, "", 1) == live_source,
            "Candidate Firestore patch touches unrelated rules")
    return {"reviewedRuleSha256": sha(part.encode()),
            "inMemoryCandidateSha256": sha(candidate.encode()),
            "liveRuleSha256": sha(live_source.encode())}


def live_state(t, base, source_hashes):
    s = load_snapshot()
    live = s.snapshot(t)
    require(live["project"] == PROJECT
            and live["projectNumber"] == "991554514268", "Wrong live project")
    require(live["firestore"] == base["firestore"]
            and live["hosting"] == base["hosting"],
            "Staging Firestore or Hosting drift; protect unrelated releases")

    old = {r["name"]: r for r in base["functions"]["inventory"]}
    now = {r["name"]: r for r in live["functions"]["inventory"]}
    profile = f"projects/{PROJECT}/locations/us-central1/functions/getAthleteProfileFeed"
    require(len(old) == 53 and len(now) == 54
            and all(now.get(k) == v for k, v in old.items())
            and set(now) - set(old) == {profile}
            and now[profile]["state"] == "ACTIVE",
            "Existing partial Athlete release diverged; do not overwrite")
    expected = {f"projects/{PROJECT}/locations/us-central1/functions/{f}" for f in FUNCTIONS}
    require(not expected.intersection(now), "One or more Command Center Functions already exist")

    release = s.api(FIRESTORE_API + "releases/cloud.firestore", t)
    require(release.get("rulesetName") == live["firestore"]["ruleset"],
            "Firestore release changed while inspecting")
    rules = s.api("https://firebaserules.googleapis.com/v1/" + release["rulesetName"], t)
    files = rules.get("source", {}).get("files", [])
    require(len(files) == 1 and isinstance(files[0].get("content"), str),
            "Unexpected active Firestore rules files")
    reviewed = (ROOT / "firestore.rules").read_text()
    candidate = rules_candidate(files[0]["content"], reviewed)
    version = live["hosting"]["version"]
    all_files = s.paged("https://firebasehosting.googleapis.com/v1beta1/"
                        + version + "/files", "files", t)
    current = {item["path"]: item["hash"] for item in all_files}
    require(len(current) == live["hosting"]["fileCount"],
            "Unexpected Hosting manifest count")
    changed = {p: {"existingHash": current.get(p),
                   "reviewedSha256": source_hashes["public" + p]}
               for p in HOSTING}
    require(len(changed) == 7 and all(re.fullmatch(r"[0-9a-f]{64}", d["reviewedSha256"])
                                       for d in changed.values()),
            "Hosting review allowlist invalid")
    # Recheck release pointers: no concurrent mutation tolerated.
    require(s.api(FIRESTORE_API + "releases/cloud.firestore", t).get("rulesetName")
            == release["rulesetName"], "Firestore changed during read-only check")
    latest = s.api(HOSTING_API + "releases?pageSize=1", t).get("releases", [])
    require(latest and latest[0]["name"] == live["hosting"]["release"],
            "Hosting changed during read-only check")
    return {
        "originalFunctionsPreserved": 53,
        "existingPartialAthleteProfilePreserved": True,
        "commandCenterFunctionsAbsent": list(FUNCTIONS),
        "firestoreRelease": release["name"],
        "firestoreRuleset": release["rulesetName"],
        "rulesCandidate": candidate,
        "hostingRelease": live["hosting"]["release"],
        "hostingVersion": version,
        "hostingManifestSha256": live["hosting"]["manifestSha256"],
        "reviewedHostingAllowlist": changed,
    }


def main():
    record = {"status": "STOP_NO_RETRY", "project": PROJECT,
              "sourceMergeSha": MERGED_SHA, "mode": "GET_ONLY_NO_MUTATION",
              "deploymentAuthorized": False, "productionAuthorized": False}
    try:
        guard()
        hashes = source()
        record["reviewedSourceFiles"] = {p: hashes[p] for p in CHANGED}
        base = baseline()
        t = subprocess.check_output(["gcloud", "auth", "print-access-token"],
                                    text=True, stderr=subprocess.DEVNULL).strip()
        record["staging"] = live_state(t, base, hashes)
        record["status"] = "PASS_READ_ONLY_PENDING_SEPARATE_RELEASE_APPROVAL"
    except Exception as error:
        # Never leak provider response bodies or credentials into evidence.
        record["failureType"] = type(error).__name__
        record["failureReason"] = str(error) if type(error) is RuntimeError else "Sanitized failure"
    finally:
        OUT.write_text(json.dumps(record, sort_keys=True, indent=2) + "\n")
    print(json.dumps({"status": record["status"], "project": PROJECT,
                      "failureType": record.get("failureType"),
                      "failureReason": record.get("failureReason"),
                      "deploymentAuthorized": False}))
    if record["status"] != "PASS_READ_ONLY_PENDING_SEPARATE_RELEASE_APPROVAL":
        sys.exit("STOP_NO_RETRY — Command Center staging read-only verification failed")


if __name__ == "__main__":
    main()
