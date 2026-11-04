#!/usr/bin/env python3
"""Fail-closed, one-file Firebase Hosting overlay for staging proposal correction."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

API = "https://firebasehosting.googleapis.com/v1beta1/"
MANIFEST = Path(__file__).with_name("proposal-correction-release.json")


def request(token, method, path, data=None):
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = Request(API + path, data=body, method=method, headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    })
    with urlopen(req, timeout=70) as response:
        return json.load(response)


def read_live(token, site):
    releases = request(token, "GET", f"sites/{site}/releases?pageSize=1").get("releases", [])
    if len(releases) != 1:
        raise RuntimeError("Missing or ambiguous Hosting release")
    release = releases[0]
    version = request(token, "GET", release["version"]["name"])
    if version.get("status") != "FINALIZED":
        raise RuntimeError("Hosting version is not finalized")
    live, page = {}, ""
    while True:
        query = "?pageSize=1000" + (("&pageToken=" + quote(page)) if page else "")
        response = request(token, "GET", version["name"] + "/files" + query)
        for entry in response.get("files", []):
            if entry["path"] in live:
                raise RuntimeError("Duplicate Hosting inventory entry")
            live[entry["path"]] = entry["hash"]
        page = response.get("nextPageToken", "")
        if not page:
            break
    if len(live) != int(version.get("fileCount", -1)) or len(live) < 100:
        raise RuntimeError("Incomplete Hosting inventory")
    for marker in ("/assets/js/runtime-environment.js", "/staging-environment.json",
                   "/assets/js/firebase-init.js"):
        if marker not in live:
            raise RuntimeError("Missing staging isolation marker: " + marker)
    return release, version, live


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", required=True, choices=("verify", "deploy"))
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--confirm-project", required=True)
    parser.add_argument("--confirm-source-sha", required=True)
    parser.add_argument("--approve-release", default="")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    if (args.confirm_project != "sandman-combat-staging"
            or args.confirm_project != manifest["projectId"]
            or args.confirm_source_sha != manifest["applicationSha"]
            or manifest["hostingAssets"] != ["/connect/proposals/proposal-safeguards.js"]
            or manifest["deploymentAuthorized"] is not False
            or manifest["productionAuthorized"] is not False):
        raise RuntimeError("Release source, scope, or project mismatch")
    token = os.environ.get("STAGING_HOSTING_TOKEN", "")
    if not token:
        raise RuntimeError("Staging-only short-lived Hosting credential required")

    release, version, live = read_live(token, manifest["hostingSite"])
    destination = manifest["hostingAssets"][0]
    data = (Path(args.source_root) / ("public" + destination)).read_bytes()
    payload = gzip.compress(data, mtime=0)
    digest = hashlib.sha256(payload).hexdigest()
    if destination not in live or live[destination] == digest:
        raise RuntimeError("Approved Hosting asset is missing or unchanged")
    updated = dict(live)
    updated[destination] = digest
    if [path for path in updated if updated[path] != live.get(path)] != [destination]:
        raise RuntimeError("Hosting change differs from the one-file allowlist")

    evidence = Path(args.evidence_dir)
    evidence.mkdir(parents=True, exist_ok=True)
    record = {
        "sourceSha": manifest["applicationSha"], "projectId": manifest["projectId"],
        "oldRelease": release["name"], "rollbackVersion": version["name"],
        "fileCount": len(live), "changedFiles": [destination],
        "before": live[destination], "after": digest, "mode": args.mode,
    }
    (evidence / "hosting-before.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record, indent=2))
    if args.mode == "verify":
        return
    if args.approve_release != "APPROVE_STAGING_PROPOSAL_CORRECTION_ONE_FUNCTION_ONE_ASSET":
        raise RuntimeError("Missing explicit protected release authorization")
    if os.environ.get("PROPOSAL_CORRECTION_FUNCTION_VERIFIED") != "yes":
        raise RuntimeError("Function verification gate has not passed")

    created = request(token, "POST", f"sites/{manifest['hostingSite']}/versions",
                      {"config": version["config"]})
    response = request(token, "POST", created["name"] + ":populateFiles", {"files": updated})
    required = response.get("uploadRequiredHashes", [])
    if required not in ([digest], []):
        raise RuntimeError("Hosting requested an unrelated file upload")
    if required:
        upload = Request(response["uploadUrl"] + "/" + digest, data=payload, method="POST",
                         headers={"Authorization": "Bearer " + token,
                                  "Content-Type": "application/octet-stream"})
        with urlopen(upload, timeout=90):
            pass
    request(token, "PATCH", created["name"] + "?updateMask=status%2Cconfig",
            {"status": "FINALIZED", "config": version["config"]})
    current = request(token, "GET", f"sites/{manifest['hostingSite']}/releases?pageSize=1")[
        "releases"][0]
    if current["name"] != release["name"] or current["version"]["name"] != version["name"]:
        raise RuntimeError("Hosting release changed while preparing the overlay")
    published = request(token, "POST", f"sites/{manifest['hostingSite']}/releases?versionName="
                        + quote(created["name"], safe="/"), {})
    (evidence / "hosting-after.json").write_text(json.dumps({
        "newRelease": published["name"], "newVersion": created["name"],
        "rollbackVersion": version["name"], "changedFiles": [destination],
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
