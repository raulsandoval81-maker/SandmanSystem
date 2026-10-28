#!/usr/bin/env python3
"""Preserve the live production Hosting version and overlay five approved files."""

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.parse
import urllib.request

import google.auth
from google.auth.transport.requests import Request

HOSTING_API = "https://firebasehosting.googleapis.com/v1beta1/"
RULES_API = "https://firebaserules.googleapis.com/v1/"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--mode", choices=("preflight", "deploy", "rollback"), required=True)
    parser.add_argument("--confirm-project", required=True)
    parser.add_argument("--confirm-source-sha", required=True)
    parser.add_argument("--expected-current-release", required=True)
    parser.add_argument("--expected-current-version", required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    evidence = Path(args.evidence_dir)
    evidence.mkdir(parents=True, exist_ok=True)

    if args.confirm_project != manifest["projectId"] or manifest["projectId"] != "sandmandashboard":
        raise RuntimeError("Exact production project confirmation failed")
    if args.confirm_source_sha != manifest["applicationSha"]:
        raise RuntimeError("Immutable application SHA confirmation failed")
    if args.mode != "rollback":
        if args.expected_current_release != manifest["baselineHostingRelease"]:
            raise RuntimeError("Expected Hosting release does not match the reviewed baseline")
        if args.expected_current_version != manifest["baselineHostingVersion"]:
            raise RuntimeError("Expected Hosting version does not match the reviewed baseline")
    elif not args.expected_current_release.startswith(f"sites/{manifest['hostingSite']}/releases/") \
            or not args.expected_current_version.startswith(f"sites/{manifest['hostingSite']}/versions/"):
        raise RuntimeError("Rollback current release/version belongs to an unexpected Hosting site")

    root = Path(args.source_root)
    payloads = {}
    overlay = {}
    for relative, expected_hash in manifest["hostingFiles"].items():
        source = root / relative
        data = source.read_bytes()
        if sha256(data) != expected_hash:
            raise RuntimeError(f"Source hash mismatch: {relative}")
        compressed = gzip.compress(data, mtime=0)
        digest = sha256(compressed)
        path = "/" + relative.removeprefix("public/")
        overlay[path] = digest
        payloads[digest] = compressed

    credentials, credential_project = google.auth.default(
        scopes=["https://www.googleapis.com/auth/firebase"]
    )
    if credential_project != manifest["projectId"]:
        raise RuntimeError("Deployment credential is not owned by the production project")
    credentials.refresh(Request())

    def api(base, method, path, data=None):
        request = urllib.request.Request(
            base + path,
            data=None if data is None else json.dumps(data).encode(),
            method=method,
            headers={
                "Authorization": "Bearer " + credentials.token,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)

    site = manifest["hostingSite"]
    current = api(HOSTING_API, "GET", f"sites/{site}/releases?pageSize=1")["releases"][0]
    current_release = current["name"]
    current_version = current["version"]["name"]
    if current_release != args.expected_current_release or current_version != args.expected_current_version:
        raise RuntimeError("Live Hosting changed after review; refresh the release manifest")

    version = api(HOSTING_API, "GET", current_version)
    if version.get("status") != "FINALIZED" or int(version.get("fileCount", 0)) < 100:
        raise RuntimeError("Live Hosting baseline is not a complete finalized site")
    if not version.get("config"):
        raise RuntimeError("Live Hosting configuration is missing")

    live_files = {}
    page = ""
    while True:
        query = "?pageSize=1000" + ("&pageToken=" + urllib.parse.quote(page) if page else "")
        result = api(HOSTING_API, "GET", current_version + "/files" + query)
        for entry in result.get("files", []):
            live_files[entry["path"]] = entry["hash"]
        page = result.get("nextPageToken", "")
        if not page:
            break
    if len(live_files) != int(version["fileCount"]):
        raise RuntimeError("Live Hosting manifest pagination was incomplete")

    rules_release = api(RULES_API, "GET", manifest["firestoreRelease"])
    ruleset = api(RULES_API, "GET", rules_release["rulesetName"])
    rules_file = next(item for item in ruleset["source"]["files"] if item["name"] == "firestore.rules")
    rules_bytes = rules_file["content"].encode()
    if args.mode != "rollback":
        if rules_release.get("rulesetName") != manifest["firestoreRuleset"]:
            raise RuntimeError("Production Firestore ruleset changed after review")
        if sha256(rules_bytes) != manifest["firestoreRulesSha256"]:
            raise RuntimeError("Production Firestore rule bytes changed after review")
        if "match /admissions_requests/{requestId}" not in rules_file["content"] or "allow create: if true;" not in rules_file["content"]:
            raise RuntimeError("Reviewed admissions request create compatibility is absent")

    candidate_files = dict(live_files)
    candidate_files.update(overlay)
    changed = sorted(path for path, value in candidate_files.items() if live_files.get(path) != value)
    if changed != sorted(overlay):
        raise RuntimeError(f"Hosting overlay escaped the exact allowlist: {changed}")

    before = {
        "projectId": manifest["projectId"],
        "site": site,
        "release": current_release,
        "version": current_version,
        "versionStatus": version["status"],
        "fileCount": len(live_files),
        "versionBytes": version.get("versionBytes"),
        "configSha256": sha256(json.dumps(version["config"], sort_keys=True).encode()),
        "firestoreRelease": rules_release["name"],
        "firestoreRuleset": rules_release["rulesetName"],
        "firestoreRulesSha256": sha256(rules_bytes),
        "overlay": changed,
        "sourceSha": manifest["applicationSha"],
        "mode": args.mode,
    }
    (evidence / "before.json").write_text(json.dumps(before, indent=2) + "\n")
    (evidence / "rollback.json").write_text(json.dumps({
        "projectId": manifest["projectId"],
        "site": site,
        "release": current_release,
        "version": current_version,
        "command": "Rerun this workflow in rollback mode with the reviewed pre-deploy release and version",
    }, indent=2) + "\n")

    if args.mode == "preflight":
        print(json.dumps(before, indent=2))
        print("PREFLIGHT ONLY: no Hosting version or release was created")
        return

    if args.mode == "rollback":
        rollback_version = manifest["baselineHostingVersion"]
        result = api(
            HOSTING_API,
            "POST",
            f"sites/{site}/releases?versionName=" + urllib.parse.quote(rollback_version, safe="/"),
            {},
        )
        (evidence / "rollback-result.json").write_text(json.dumps(result, indent=2) + "\n")
        return

    new_version = api(HOSTING_API, "POST", f"sites/{site}/versions", {"config": version["config"]})
    new_name = new_version["name"]
    upload_urls = {}
    items = list(candidate_files.items())
    for index in range(0, len(items), 900):
        populated = api(HOSTING_API, "POST", new_name + ":populateFiles", {"files": dict(items[index:index + 900])})
        for digest in populated.get("uploadRequiredHashes", []):
            if digest not in payloads:
                raise RuntimeError("Hosting requested an unrelated live asset upload; aborting")
            upload_urls[digest] = populated["uploadUrl"]
    for digest, url in upload_urls.items():
        request = urllib.request.Request(
            url + "/" + digest,
            data=payloads[digest],
            method="POST",
            headers={"Authorization": "Bearer " + credentials.token, "Content-Type": "application/octet-stream"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError("Hosting asset upload failed")
    api(HOSTING_API, "PATCH", new_name + "?updateMask=status%2Cconfig", {"status": "FINALIZED", "config": version["config"]})

    latest = api(HOSTING_API, "GET", f"sites/{site}/releases?pageSize=1")["releases"][0]
    if latest["name"] != current_release or latest["version"]["name"] != current_version:
        raise RuntimeError("Live Hosting changed during preparation; refusing to release")
    released = api(
        HOSTING_API,
        "POST",
        f"sites/{site}/releases?versionName=" + urllib.parse.quote(new_name, safe="/"),
        {},
    )
    (evidence / "after.json").write_text(json.dumps(released, indent=2) + "\n")
    verification = {}
    cache_key = new_name.rsplit("/", 1)[-1]
    for origin in (f"https://{site}.web.app", manifest["productionOrigin"]):
        origin_result = {}
        for relative, expected_hash in manifest["hostingFiles"].items():
            path = "/" + relative.removeprefix("public/")
            url = origin + path + "?release=" + urllib.parse.quote(cache_key)
            last_hash = None
            for attempt in range(5):
                try:
                    with urllib.request.urlopen(url, timeout=30) as response:
                        body = response.read()
                    last_hash = sha256(body)
                    if last_hash == expected_hash:
                        break
                except Exception:
                    last_hash = "request-failed"
                if attempt < 4:
                    time.sleep(2)
            if last_hash != expected_hash:
                raise RuntimeError(f"Post-deployment verification failed: {origin}{path}")
            origin_result[path] = last_hash
        verification[origin] = origin_result
    (evidence / "verification.json").write_text(json.dumps(verification, indent=2) + "\n")
    print(json.dumps({"released": released["name"], "version": new_name, "rollbackVersion": current_version}, indent=2))


if __name__ == "__main__":
    main()
