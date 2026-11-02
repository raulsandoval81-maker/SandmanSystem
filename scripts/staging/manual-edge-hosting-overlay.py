#!/usr/bin/env python3
"""Staging-only, five-file Manual Edge-Case Hosting overlay preserving the live baseline."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request
import google.auth
from google.auth.transport.requests import Request

SITE = "sandman-combat-staging"
PROJECT = "sandman-combat-staging"
SOURCE_SHA = "f884bebb5d79b5ee0deb4b8321acd37d88bc997d"
FILES = (
    "public/management/billing/index.html",
    "public/management/manual-edge-case-proposal/index.html",
    "public/management/manual-edge-case-proposal/tool.css",
    "public/management/manual-edge-case-proposal/tool.js",
    "public/management/shared/management-shell-frame.js",
)
BASE = "https://firebasehosting.googleapis.com/v1beta1/"

def api(token, method, path, data=None):
    request = urllib.request.Request(
        BASE + path,
        method=method,
        data=None if data is None else json.dumps(data).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["preflight", "deploy"], required=True)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--confirm-project", required=True)
    parser.add_argument("--confirm-source-sha", required=True)
    parser.add_argument("--expected-release", default="")
    parser.add_argument("--expected-version", default="")
    args = parser.parse_args()
    if args.confirm_project != PROJECT or args.confirm_source_sha != SOURCE_SHA:
        raise RuntimeError("Staging target or immutable SHA confirmation mismatch")
    evidence = Path(args.evidence_dir)
    evidence.mkdir(parents=True, exist_ok=True)
    credential, credential_project = google.auth.default(scopes=["https://www.googleapis.com/auth/firebase"])
    if credential_project != PROJECT:
        raise RuntimeError("Credential project must be sandman-combat-staging")
    credential.refresh(Request())
    token = credential.token
    release = api(token, "GET", f"sites/{SITE}/releases?pageSize=1")["releases"][0]
    release_name = release["name"]
    version_name = release["version"]["name"]
    if not release_name.startswith(f"sites/{SITE}/releases/") or not version_name.startswith(f"sites/{SITE}/versions/"):
        raise RuntimeError("Unexpected staging Hosting release identity")
    version = api(token, "GET", version_name)
    if version.get("status") != "FINALIZED" or int(version.get("fileCount", 0)) < 100 or not version.get("config"):
        raise RuntimeError("Current Hosting site must be complete, finalized, and configured")
    live = {}
    page = ""
    while True:
        query = "?pageSize=1000" + ("&pageToken=" + urllib.parse.quote(page) if page else "")
        response = api(token, "GET", version_name + "/files" + query)
        for entry in response.get("files", []):
            live[entry["path"]] = entry["hash"]
        page = response.get("nextPageToken", "")
        if not page:
            break
    if len(live) != int(version["fileCount"]):
        raise RuntimeError("Live staging Hosting manifest did not fully load")
    for required in ("/assets/js/runtime-environment.js", "/staging-environment.json", "/assets/js/firebase-init.js"):
        if required not in live:
            raise RuntimeError("Existing Hosting lacks required staging isolation asset: " + required)
    updated = dict(live)
    payloads = {}
    source = Path(args.source_root)
    for relative in FILES:
        data = (source / relative).read_bytes()
        if relative.endswith("/tool.js") and b'"manualEdgeCaseProposal"' not in data:
            raise RuntimeError("Source lacks Manual Edge-Case callable binding")
        if relative.endswith("/index.html") and "manual-edge-case-proposal" in relative and b"loadForm" not in data:
            raise RuntimeError("Source lacks Manual Edge-Case interface")
        if relative == "public/management/billing/index.html" and b"/management/manual-edge-case-proposal/" not in data:
            raise RuntimeError("Source Billing page lacks Manual Edge-Case navigation")
        if len(data) < 100:
            raise RuntimeError("Approved source file is unexpectedly small: " + relative)
        compressed = gzip.compress(data, mtime=0)
        digest = hashlib.sha256(compressed).hexdigest()
        updated["/" + relative.removeprefix("public/")] = digest
        payloads[digest] = compressed
    changed = sorted(k for k in updated if updated[k] != live.get(k))
    if not changed or not set(changed).issubset({"/" + f.removeprefix("public/") for f in FILES}):
        raise RuntimeError("No approved staging changes or an unapproved Hosting change detected")
    report = {
        "mode": args.mode, "stagingProject": PROJECT, "site": SITE,
        "sourceSha": SOURCE_SHA, "priorRelease": release_name,
        "priorVersion": version_name, "existingFileCount": len(live),
        "filesChanged": changed, "cloudFunctionsModified": False, "firestoreRulesModified": False,
    }
    (evidence / "before.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    if args.mode == "preflight":
        print("PREFLIGHT ONLY. No staging Hosting version created.")
        return
    if args.expected_release != release_name or args.expected_version != version_name:
        raise RuntimeError("Staging Hosting changed since reviewed preflight, or baseline not explicitly confirmed")
    new = api(token, "POST", f"sites/{SITE}/versions", {"config": version["config"]})
    new_name = new["name"]
    upload_urls = {}
    items = list(updated.items())
    for i in range(0, len(items), 900):
        output = api(token, "POST", new_name + ":populateFiles", {"files": dict(items[i:i+900])})
        for digest in output.get("uploadRequiredHashes", []):
            if digest not in payloads:
                raise RuntimeError("Unrelated staging asset requested: refusing release")
            upload_urls[digest] = output["uploadUrl"]
    for digest, url in upload_urls.items():
        request = urllib.request.Request(
            url + "/" + digest, data=payloads[digest], method="POST",
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/octet-stream"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError("Hosting upload failed")
    api(token, "PATCH", new_name + "?updateMask=status%2Cconfig",
        {"status": "FINALIZED", "config": version["config"]})
    latest = api(token, "GET", f"sites/{SITE}/releases?pageSize=1")["releases"][0]
    if latest["name"] != release_name or latest["version"]["name"] != version_name:
        raise RuntimeError("Staging Hosting changed during deployment: aborting before release")
    result = api(token, "POST", f"sites/{SITE}/releases?versionName=" + urllib.parse.quote(new_name, safe="/"), {})
    (evidence / "after.json").write_text(json.dumps({
        "newRelease": result["name"], "newVersion": new_name, "rollbackVersion": version_name,
        "approvedFiles": changed, "sourceSha": SOURCE_SHA,
    }, indent=2) + "\n")
    print("Staging Manual Edge-Case Hosting overlay released:", result["name"])

if __name__ == "__main__":
    main()
