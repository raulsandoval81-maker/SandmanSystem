#!/usr/bin/env python3
"""Read-only Firebase Hosting baseline for one immutable, allowlisted staging release."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import quote

BASE = "https://firebasehosting.googleapis.com/v1beta1/"
SITE = "sandman-combat-staging"
FILES = [
    "public/assets/js/pricing/sandman-pricing-catalog.js",
    "public/assets/js/pricing/sandman-pricing-engine.js",
    "public/management/billing/billing.js",
    "public/management/billing/prepaid-terms.js",
]

def get(path, token):
    req = Request(BASE + path, headers={"Authorization": "Bearer " + token})
    with urlopen(req, timeout=40) as resp:
        return json.load(resp)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--evidence-file", required=True)
    args = parser.parse_args()
    token = os.environ.get("STAGING_HOSTING_TOKEN", "")
    if not token:
        raise RuntimeError("Missing short-lived staging Hosting token")
    releases = get(f"sites/{SITE}/releases?pageSize=1", token).get("releases", [])
    if len(releases) != 1:
        raise RuntimeError("Staging Hosting release not identifiable")
    release = releases[0]
    version_name = release["version"]["name"]
    version = get(version_name, token)
    if version.get("status") != "FINALIZED":
        raise RuntimeError("Hosting baseline is not finalized")
    live, page = {}, ""
    while True:
        suffix = "?pageSize=1000" + ("&pageToken=" + quote(page) if page else "")
        response = get(version_name + "/files" + suffix, token)
        live.update({entry["path"]: entry["hash"] for entry in response.get("files", [])})
        page = response.get("nextPageToken", "")
        if not page:
            break
    if len(live) != int(version.get("fileCount", -1)) or len(live) < 100:
        raise RuntimeError("Incomplete Hosting file inventory")
    for marker in [
        "/assets/js/runtime-environment.js",
        "/assets/js/firebase-init.js",
        "/staging-environment.json",
    ]:
        if marker not in live:
            raise RuntimeError("Staging marker is missing: " + marker)
    files = []
    for relative in FILES:
        data = (Path(args.source_root) / relative).read_bytes()
        if len(data) < 100:
            raise RuntimeError("Unexpectedly small public asset: " + relative)
        dest = "/" + relative.removeprefix("public/")
        if dest not in live and relative != "public/management/billing/prepaid-terms.js":
            raise RuntimeError("Missing existing staged asset: " + dest)
        digest = hashlib.sha256(gzip.compress(data, mtime=0)).hexdigest()
        files.append({"path": dest, "currentHash": live.get(dest), "proposedHash": digest,
                      "willChange": digest != live.get(dest)})
    report = {"project": SITE, "site": SITE, "priorRelease": release["name"],
              "rollbackVersion": version_name, "fileCount": len(live),
              "plannedFiles": files, "deploymentAuthorized": False}
    evidence = Path(args.evidence_file)
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
