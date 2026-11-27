#!/usr/bin/env python3
"""Sprint 1 staging snapshot. GET-only API requests; no mutation or secrets in evidence."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "sandman-combat-staging"
EXPECTED_SHA = "0e9d96e3994094fffacbb606ac77f474902bf666"
OUT = Path("sprint1-staging-readonly-evidence.json")
PUBLIC_FILES = (
    "public/assets/js/athlete-dashboard-data.js",
    "public/assets/js/athlete-nav.js",
    "public/assets/js/athlete-profile-read.js",
    "public/assets/js/athlete-self-context.js",
    "public/assets/js/immutable-lane-archive.js",
    "public/athletes/arsenal/arsenal.app.js",
    "public/athletes/arsenal/arsenal.linker.js",
    "public/athletes/arsenal/mini-arsenal.app.js",
    "public/athletes/hub/index.html",
    "public/athletes/profile/adult-profile.js",
    "public/athletes/profile/history/history.js",
    "public/athletes/profile/index.html",
    "public/athletes/profile/mini-profile.js",
    "public/athletes/profile/path2legend-skills.js",
    "public/athletes/profile/profile.js",
    "public/athletes/profile/road2champion-skills.js",
    "public/coaches/lanes/conditioning/review.js",
    "public/coaches/lanes/honor/review.js",
)
FUNCTION_FILES = (
    "functions/src/modules/athlete/getAthleteProfileFeed.ts",
    "functions/src/modules/athlete/getAthleteSkillsSummary.ts",
    "functions/src/services/athleteProfileReadAuthorization.ts",
)
RULES_FILE = "scripts/staging/p0-containment/firestore.rules"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def cmd(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()


def api(url, token):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=35) as response:
        return json.load(response)


def paged(url, key, token):
    items, cursor, seen = [], "", set()
    while True:
        u = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(
            {"pageSize": 1000, **({"pageToken": cursor} if cursor else {})})
        page = api(u, token)
        items.extend(page.get(key, []))
        cursor = page.get("nextPageToken", "")
        if not cursor:
            return items
        if cursor in seen:
            raise RuntimeError("Repeated API page token")
        seen.add(cursor)


def verify_source():
    # The workflow itself is introduced by a later merge. Require that all
    # releasable source files still equal the independently tested Sprint 1 SHA.
    assert subprocess.run(["git", "merge-base", "--is-ancestor", EXPECTED_SHA, "HEAD"],
                          check=False).returncode == 0, "Sprint 1 commit absent from main"
    assert not cmd("git", "status", "--porcelain"), "Working copy differs"
    inputs = (*PUBLIC_FILES, *FUNCTION_FILES, RULES_FILE)
    assert subprocess.run(["git", "diff", "--quiet", EXPECTED_SHA, "HEAD", "--", *inputs],
                          check=False).returncode == 0, "Sprint 1 release source drift"
    return {path: sha(Path(path).read_bytes()) for path in inputs}


def snapshot(token):
    project = api(f"https://firebase.googleapis.com/v1beta1/projects/{PROJECT}", token)
    assert project.get("projectId") == PROJECT, "Unexpected Firebase project"
    assert str(project.get("projectNumber")) == "991554514268", "Unexpected project number"
    rules_base = f"https://firebaserules.googleapis.com/v1/projects/{PROJECT}/"
    release = api(rules_base + "releases/cloud.firestore", token)
    ruleset = release["rulesetName"]
    assert re.fullmatch(rf"projects/{PROJECT}/rulesets/[a-zA-Z0-9_-]+", ruleset)
    rules_data = api("https://firebaserules.googleapis.com/v1/" + ruleset, token)
    rule_files = rules_data.get("source", {}).get("files", [])
    assert rule_files, "No Firestore rule files"
    rules_digest = sha(json.dumps(rule_files, sort_keys=True, separators=(",", ":")).encode())

    hosting_base = f"https://firebasehosting.googleapis.com/v1beta1/sites/{PROJECT}/"
    releases = api(hosting_base + "releases?pageSize=1", token).get("releases", [])
    assert releases, "No staging Hosting release"
    hosting_release = releases[0]["name"]
    hosting_version = releases[0]["version"]["name"]
    assert hosting_release.startswith(f"sites/{PROJECT}/releases/")
    assert hosting_version.startswith(f"sites/{PROJECT}/versions/")
    version = api("https://firebasehosting.googleapis.com/v1beta1/" + hosting_version, token)
    assert version.get("status") == "FINALIZED", "Hosting version is not finalized"
    manifest = paged("https://firebasehosting.googleapis.com/v1beta1/" + hosting_version + "/files", "files", token)
    assert manifest, "Hosting manifest empty"
    manifest_digest = sha(json.dumps(
        sorted((i["path"], i["hash"]) for i in manifest),
        separators=(",", ":")).encode())
    # Only target path hashes are included, never application data.
    target_hashes = {"/" + p.removeprefix("public/"): None for p in PUBLIC_FILES}
    for item in manifest:
        if item["path"] in target_hashes:
            target_hashes[item["path"]] = item["hash"]

    functions_url = f"https://cloudfunctions.googleapis.com/v2/projects/{PROJECT}/locations/-/functions"
    functions = paged(functions_url, "functions", token)
    safe_functions = [
        {"name": f["name"], "state": f.get("state"),
         "updateTime": f.get("updateTime"),
         "runtime": f.get("buildConfig", {}).get("runtime"),
         "revision": f.get("serviceConfig", {}).get("revision")}
        for f in functions
    ]
    # Re-read both release pointers, fail on concurrent environment drift.
    assert api(rules_base + "releases/cloud.firestore", token)["rulesetName"] == ruleset, "Rules changed during snapshot"
    latest = api(hosting_base + "releases?pageSize=1", token).get("releases", [])
    assert latest and latest[0]["name"] == hosting_release, "Hosting changed during snapshot"
    return {
        "project": PROJECT, "projectNumber": str(project["projectNumber"]),
        "firestore": {"release": release["name"], "ruleset": ruleset,
                      "sourceFilesSha256": rules_digest},
        "hosting": {"release": hosting_release, "version": hosting_version,
                    "configSha256": sha(json.dumps(version.get("config", {}), sort_keys=True).encode()),
                    "fileCount": len(manifest), "manifestSha256": manifest_digest,
                    "sprint1TargetCurrentHashes": target_hashes},
        "functions": {"count": len(functions), "inventory": safe_functions},
    }


def main():
    evidence = {"status": "BLOCKED", "sourceSha": EXPECTED_SHA, "environment": PROJECT,
                "deployAuthorized": False, "operation": "GET_ONLY_PREFLIGHT"}
    try:
        assert os.environ.get("GITHUB_REPOSITORY") == "raulsandoval81-maker/SandmanSystem"
        assert os.environ.get("GITHUB_REF") == "refs/heads/main"
        assert os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
        assert os.environ.get("CONFIRM_PROJECT") == PROJECT
        assert os.environ.get("GITHUB_WORKFLOW_REF") == (
            "raulsandoval81-maker/SandmanSystem/.github/workflows/"
            "athlete-sprint1-staging-preflight.yml@refs/heads/main")
        evidence["localSourceHashes"] = verify_source()
        token = cmd("gcloud", "auth", "print-access-token")
        evidence["snapshot"] = snapshot(token)
        evidence["status"] = "PASS_READ_ONLY"
    except Exception as exc:
        # Never persist API exception bodies, potentially including secrets.
        evidence["failureType"] = type(exc).__name__
        evidence["status"] = "STOP_NO_RETRY"
    finally:
        OUT.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n")
    if evidence["status"] != "PASS_READ_ONLY":
        sys.exit("STOP_NO_RETRY: staging preflight failed; inspect sanitized evidence")


if __name__ == "__main__":
    main()
