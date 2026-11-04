#!/usr/bin/env python3
"""Fail-closed, four-file-only Firebase Hosting release for PIF V2 staging."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

API = "https://firebasehosting.googleapis.com/v1beta1/"
MANIFEST = Path(__file__).with_name("pif-v2-controlled-release.json")


def request(token, method, path, data=None):
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = Request(
        API + path, data=body, method=method,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    with urlopen(req, timeout=70) as response:
        return json.load(response)


def read_live(token, m):
    release_list = request(token, "GET", f"sites/{m['hostingSite']}/releases?pageSize=1")
    releases = release_list.get("releases", [])
    if len(releases) != 1:
        raise RuntimeError("Missing or ambiguous Hosting release")
    release = releases[0]
    release_name = release["name"]
    version_name = release["version"]["name"]
    if release_name != m["hostingReleaseBefore"] or version_name != m["hostingVersionBefore"]:
        raise RuntimeError("Staging Hosting baseline drifted; refusing release")
    version = request(token, "GET", version_name)
    if version.get("status") != "FINALIZED":
        raise RuntimeError("Hosting version is not finalized")
    live, page = {}, ""
    while True:
        query = "?pageSize=1000" + (("&pageToken=" + quote(page)) if page else "")
        response = request(token, "GET", version_name + "/files" + query)
        for entry in response.get("files", []):
            path = entry["path"]
            if path in live:
                raise RuntimeError("Duplicate Hosting inventory entry")
            live[path] = entry["hash"]
        page = response.get("nextPageToken", "")
        if not page:
            break
    if len(live) != int(version.get("fileCount", -1)) or len(live) < 100:
        raise RuntimeError("Incomplete Hosting inventory")
    for path in ("/assets/js/runtime-environment.js", "/staging-environment.json", "/assets/js/firebase-init.js"):
        if path not in live:
            raise RuntimeError("Missing staging isolation marker: " + path)
    return release_name, version_name, version, live


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", required=True, choices=("verify", "deploy"))
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--confirm-project", required=True)
    parser.add_argument("--confirm-source-sha", required=True)
    parser.add_argument("--approve-release", default="")
    args = parser.parse_args()
    m = json.loads(MANIFEST.read_text())
    if (args.confirm_project != "sandman-combat-staging"
            or args.confirm_project != m["projectId"]
            or args.confirm_source_sha != m["applicationSha"]
            or m["productionAuthorized"] is not False
            or m["deploymentAuthorized"] is not False
            or m["rollbackAutomatic"] is not False):
        raise RuntimeError("Release source or project authorization mismatch")
    token = os.environ.get("STAGING_HOSTING_TOKEN", "")
    if not token:
        raise RuntimeError("Staging-only short-lived Hosting credential required")
    release_name, version_name, version, live = read_live(token, m)
    source = Path(args.source_root)
    updated = dict(live)
    payloads = {}
    assets = []
    for dest in m["hostingAssets"]:
        if not dest.startswith("/") or dest == "/":
            raise RuntimeError("Invalid allowlisted Hosting asset")
        data = (source / ("public" + dest)).read_bytes()
        if len(data) < 100:
            raise RuntimeError("Approved asset is unexpectedly small: " + dest)
        blob = gzip.compress(data, mtime=0)
        digest = hashlib.sha256(blob).hexdigest()
        if dest not in live and dest != "/management/billing/prepaid-terms.js":
            raise RuntimeError("Existing asset is missing: " + dest)
        assets.append({"path": dest, "before": live.get(dest), "after": digest})
        updated[dest] = digest
        payloads[digest] = blob
    changed = sorted(key for key in updated if updated[key] != live.get(key))
    if set(changed) != set(m["hostingAssets"]):
        raise RuntimeError("Hosting proposed change set differs from exact four-file allowlist")
    evidence = Path(args.evidence_dir)
    evidence.mkdir(parents=True, exist_ok=True)
    record = {
        "sourceSha": m["applicationSha"], "projectId": m["projectId"],
        "oldRelease": release_name, "rollbackVersion": version_name,
        "fileCount": len(live), "changedFiles": changed, "assets": assets,
        "mode": args.mode
    }
    (evidence / "hosting-before.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record, indent=2))
    if args.mode == "verify":
        return
    if args.approve_release != "APPROVE_PIF_V2_STAGING_ONE_FUNCTION_FOUR_ASSETS":
        raise RuntimeError("Missing explicit protected release authorization")
    if os.environ.get("PIF_V2_FUNCTION_DEPLOYED_AND_VERIFIED") != "yes":
        raise RuntimeError("Function verification gate has not passed")
    new = request(token, "POST", f"sites/{m['hostingSite']}/versions", {"config": version["config"]})
    files = list(updated.items())
    for start in range(0, len(files), 900):
        response = request(token, "POST", new["name"] + ":populateFiles", {"files": dict(files[start:start + 900])})
        for digest in response.get("uploadRequiredHashes", []):
            if digest not in payloads:
                raise RuntimeError("Hosting requested an unrelated file upload")
            upload_req = Request(
                response["uploadUrl"] + "/" + digest,
                data=payloads[digest], method="POST",
                headers={"Authorization": "Bearer " + token, "Content-Type": "application/octet-stream"},
            )
            with urlopen(upload_req, timeout=90):
                pass
    request(token, "PATCH", new["name"] + "?updateMask=status%2Cconfig",
            {"status": "FINALIZED", "config": version["config"]})
    before_final = request(token, "GET", f"sites/{m['hostingSite']}/releases?pageSize=1")["releases"][0]
    if before_final["name"] != release_name or before_final["version"]["name"] != version_name:
        raise RuntimeError("Hosting release changed while preparing the overlay")
    created = request(token, "POST", f"sites/{m['hostingSite']}/releases?versionName="
                      + quote(new["name"], safe="/"), {})
    (evidence / "hosting-after.json").write_text(json.dumps({
        "newRelease": created["name"], "newVersion": new["name"],
        "rollbackVersion": version_name, "changedFiles": changed
    }, indent=2) + "\n")
    published = request(token, "GET", new["name"])
    if published.get("status") != "FINALIZED" or published.get("config") != version.get("config"):
        raise RuntimeError("New Hosting version configuration differs from baseline")
    print("Staging Hosting release completed. Retain rollback version:", version_name)


if __name__ == "__main__":
    main()
