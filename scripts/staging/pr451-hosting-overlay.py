#!/usr/bin/env python3
"""Fail-closed two-file Hosting overlay for the immutable PR #451 source."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import urllib.parse
import urllib.request

PROJECT = SITE = "sandman-combat-staging"
SOURCE_SHA = "88c80ff1ceebbcf281e209559c2c2a2a84ffa7db"
FILES = (
    "public/connect/enrollment/enrollment.js",
    "public/management/billing/billing.js",
)
BASE = "https://firebasehosting.googleapis.com/v1beta1/"


def api(token, method, path, data=None):
    request = urllib.request.Request(
        BASE + path, method=method,
        data=None if data is None else json.dumps(data).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("preflight", "deploy"), required=True)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--confirm-project", required=True)
    parser.add_argument("--confirm-source-sha", required=True)
    parser.add_argument("--expected-release", default="")
    parser.add_argument("--expected-version", default="")
    args = parser.parse_args()
    if args.confirm_project != PROJECT or args.confirm_source_sha != SOURCE_SHA:
        raise RuntimeError("Staging target or immutable source confirmation mismatch")

    token = os.environ.get("SANDMAN_FIREBASE_ACCESS_TOKEN", "")
    if not token:
        raise RuntimeError("A short-lived staging Firebase access token is required")
    release = api(token, "GET", f"sites/{SITE}/releases?pageSize=1")["releases"][0]
    release_name, version_name = release["name"], release["version"]["name"]
    version = api(token, "GET", version_name)
    if version.get("status") != "FINALIZED" or int(version.get("fileCount", 0)) < 100:
        raise RuntimeError("Current staging Hosting baseline is incomplete")

    live, page = {}, ""
    while True:
        query = "?pageSize=1000" + ("&pageToken=" + urllib.parse.quote(page) if page else "")
        response = api(token, "GET", version_name + "/files" + query)
        live.update({entry["path"]: entry["hash"] for entry in response.get("files", [])})
        page = response.get("nextPageToken", "")
        if not page:
            break
    if len(live) != int(version["fileCount"]):
        raise RuntimeError("Could not account for every deployed Hosting file")
    for required in ("/assets/js/runtime-environment.js", "/staging-environment.json", "/assets/js/firebase-init.js"):
        if required not in live:
            raise RuntimeError("Staging isolation marker missing: " + required)

    updated, payloads = dict(live), {}
    source = Path(args.source_root)
    for relative in FILES:
        data = (source / relative).read_bytes()
        if len(data) < 1000:
            raise RuntimeError("Approved source file is unexpectedly small: " + relative)
        compressed = gzip.compress(data, mtime=0)
        digest = hashlib.sha256(compressed).hexdigest()
        updated["/" + relative.removeprefix("public/")] = digest
        payloads[digest] = compressed
    changed = sorted(path for path in updated if updated[path] != live.get(path))
    allowed = {"/" + value.removeprefix("public/") for value in FILES}
    if not changed or not set(changed).issubset(allowed):
        raise RuntimeError("No approved Hosting change or an unapproved change was detected")

    evidence = Path(args.evidence_dir)
    evidence.mkdir(parents=True, exist_ok=True)
    report = {"mode": args.mode, "project": PROJECT, "sourceSha": SOURCE_SHA,
              "priorRelease": release_name, "priorVersion": version_name,
              "existingFileCount": len(live), "filesChanged": changed}
    (evidence / "before.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    if args.mode == "preflight":
        return
    if args.expected_release != release_name or args.expected_version != version_name:
        raise RuntimeError("Hosting baseline changed after approval")

    new = api(token, "POST", f"sites/{SITE}/versions", {"config": version["config"]})
    items = list(updated.items())
    for index in range(0, len(items), 900):
        result = api(token, "POST", new["name"] + ":populateFiles", {"files": dict(items[index:index + 900])})
        for digest in result.get("uploadRequiredHashes", []):
            if digest not in payloads:
                raise RuntimeError("Unrelated Hosting asset upload requested")
            request = urllib.request.Request(result["uploadUrl"] + "/" + digest, data=payloads[digest], method="POST",
                                             headers={"Authorization": "Bearer " + token,
                                                      "Content-Type": "application/octet-stream"})
            with urllib.request.urlopen(request, timeout=60):
                pass
    api(token, "PATCH", new["name"] + "?updateMask=status%2Cconfig", {"status": "FINALIZED", "config": version["config"]})
    latest = api(token, "GET", f"sites/{SITE}/releases?pageSize=1")["releases"][0]
    if latest["name"] != release_name or latest["version"]["name"] != version_name:
        raise RuntimeError("Hosting changed during preparation; refusing release")
    result = api(token, "POST", f"sites/{SITE}/releases?versionName=" + urllib.parse.quote(new["name"], safe="/"), {})
    (evidence / "after.json").write_text(json.dumps({"newRelease": result["name"], "newVersion": new["name"],
                                                     "rollbackVersion": version_name}, indent=2) + "\n")


if __name__ == "__main__":
    main()
