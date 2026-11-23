#!/usr/bin/env python3
"""Production XP Management day-mode exact-four-file Hosting overlay. STOP_NO_RETRY."""
import argparse
import gzip
import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import quote

import google.auth
from google.auth.transport.requests import AuthorizedSession

FILES = (
    "management/xp-adjustments/index.html",
    "management/xp-adjustments/xp-adjustments.css",
    "management/xp-adjustments/coach-paper-queue.js",
    "management/xp-adjustments/coach-recovery-queue.js",
)
SITES = {
    "production": ("sandmandashboard", "sandman-main"),
}
SOURCE_SHA = "1d5c5fb590ccb4b01f7944dd7cc8731a1f76ddc1"
BASE = "https://firebasehosting.googleapis.com/v1beta1/"

def fail(message):
    raise RuntimeError("STOP_NO_RETRY: " + message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--environment", choices=SITES, required=True)
    p.add_argument("--mode", choices=("preflight", "deploy"), required=True)
    p.add_argument("--source-root", required=True)
    p.add_argument("--source-sha", required=True)
    p.add_argument("--expected-release", default="")
    p.add_argument("--expected-version", default="")
    p.add_argument("--evidence-dir", required=True)
    p.add_argument("--confirm-project", required=True)
    p.add_argument("--approval-token", default="")
    args = p.parse_args()
    project, site = SITES[args.environment]
    if args.source_sha != SOURCE_SHA or args.confirm_project != "sandmandashboard":
        fail("unapproved source SHA or production project")
    if args.mode == "deploy" and args.approval_token != "APPLY_XP_REPORT_LIGHTMODE_FOUR_FILES":
        fail("missing explicit four-file deployment approval token")
    evidence = Path(args.evidence_dir)
    evidence.mkdir(parents=True, exist_ok=True)
    source = Path(args.source_root).resolve()
    try:
        subprocess.run(["git", "-C", str(source), "cat-file", "-e", f"{SOURCE_SHA}^{{commit}}"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        fail("pinned application source commit not available locally")
    assets = {}
    raw_hashes = {}
    for relative in FILES:
        data = (source / "public" / relative).read_bytes()
        if len(data) < 100:
            fail("missing or unexpectedly small source: " + relative)
        try:
            pinned = subprocess.run(
                ["git", "-C", str(source), "show", f"{SOURCE_SHA}:public/{relative}"],
                check=True, capture_output=True,
            ).stdout
        except subprocess.CalledProcessError:
            fail("could not read pinned source: " + relative)
        if data != pinned:
            fail("local file differs from approved source SHA: " + relative)
        raw_hashes["/" + relative] = digest(data)
        zipped = gzip.compress(data, mtime=0)
        assets["/" + relative] = (digest(zipped), zipped)
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/firebase"])
    session = AuthorizedSession(creds)

    def request(method, path, body=None, upload=False):
        url = path if upload else BASE + path.lstrip("/")
        response = session.request(method, url, json=body if not upload else None,
                                   data=body if upload else None, timeout=90,
                                   allow_redirects=False)
        if response.status_code >= 300:
            fail(f"Hosting API {method} failed HTTP {response.status_code}")
        return response.json() if response.content and not upload else {}

    def active():
        result = request("GET", f"sites/{site}/releases?pageSize=1")
        releases = result.get("releases", [])
        if not releases:
            fail("no active release")
        release = releases[0]
        version = release.get("version", {}).get("name", "")
        if not release["name"].startswith(f"sites/{site}/releases/") or not version.startswith(f"sites/{site}/versions/"):
            fail("unexpected active release identity")
        return release["name"], version

    def files(version_name):
        result = {}
        token = ""
        seen = set()
        while True:
            suffix = f"?pageSize=1000" + (f"&pageToken={quote(token, safe='')}" if token else "")
            page = request("GET", version_name + "/files" + suffix)
            for entry in page.get("files", []):
                path, h = entry.get("path"), entry.get("hash")
                if not path or not path.startswith("/") or path in result or not isinstance(h, str) or len(h) != 64 or entry.get("status") != "ACTIVE":
                    fail("invalid, duplicate or inactive manifest entry")
                result[path] = h
            token = page.get("nextPageToken", "")
            if not token:
                return result
            if token in seen:
                fail("repeated manifest pagination token")
            seen.add(token)

    release, version_name = active()
    baseline = request("GET", version_name)
    if baseline.get("status") != "FINALIZED" or int(baseline.get("fileCount", 0)) < 3000 or not isinstance(baseline.get("config"), dict):
        fail("incomplete baseline or missing Hosting config")
    live = files(version_name)
    if len(live) != int(baseline["fileCount"]):
        fail("incomplete manifest pagination")
    if active() != (release, version_name):
        fail("baseline changed during inventory")
    proposed = dict(live)
    if set(assets) - set(live):
        fail("one or more approved paths missing from the live Hosting manifest")
    for path, (h, _) in assets.items():
        proposed[path] = h
    changed = sorted(path for path in proposed if proposed[path] != live.get(path))
    if not changed or set(changed) - set(assets):
        fail("unexpected or empty change set")
    report = dict(environment=args.environment, project=project, site=site,
                  sourceSha=SOURCE_SHA, baselineRelease=release, baselineVersion=version_name,
                  baselineFileCount=len(live), proposedFileCount=len(proposed),
                  changedPaths=changed, rawSha256=raw_hashes,
                  config=baseline["config"], deploymentPerformed=False)
    print(json.dumps({k: v for k, v in report.items() if k != "config"}, indent=2))
    if args.mode == "preflight":
        (evidence / "preflight.json").write_text(json.dumps(report, indent=2) + "\n")
        print("PREFLIGHT_ONLY — no Hosting write performed")
        return
    prior_file = evidence / "preflight.json"
    if not prior_file.exists():
        fail("missing separate preflight evidence")
    prior = json.loads(prior_file.read_text())
    if prior != report:
        fail("current release, config, hashes, or changed paths differ from saved preflight")
    if args.expected_release != release or args.expected_version != version_name:
        fail("explicit approved baseline does not match live release")
    if active() != (release, version_name):
        fail("baseline changed before version creation")
    new = request("POST", f"sites/{site}/versions", {"config": baseline["config"]})
    new_name = new.get("name", "")
    if not new_name.startswith(f"sites/{site}/versions/") or new_name == version_name:
        fail("invalid new version")
    payloads = {h: zipped for h, zipped in assets.values()}
    upload_urls = {}
    entries = list(proposed.items())
    for offset in range(0, len(entries), 900):
        result = request("POST", new_name + ":populateFiles",
                         {"files": dict(entries[offset:offset + 900])})
        upload_url = result.get("uploadUrl", "")
        if result.get("uploadRequiredHashes") and not upload_url.startswith("https://upload-firebasehosting.googleapis.com/"):
            fail("untrusted upload destination")
        for h in result.get("uploadRequiredHashes", []):
            if h not in payloads:
                fail("unrelated file upload requested")
            upload_urls[h] = upload_url
    for h, url in upload_urls.items():
        request("POST", url.rstrip("/") + "/" + h, payloads[h], upload=True)
    request("PATCH", new_name + "?updateMask=status", {"status": "FINALIZED"})
    prepared = request("GET", new_name)
    if prepared.get("status") != "FINALIZED" or prepared.get("config") != baseline["config"] or files(new_name) != proposed:
        fail("prepared version verification failed; no release performed")
    if active() != (release, version_name):
        fail("baseline changed before publication")
    published = request("POST", f"sites/{site}/releases?versionName={quote(new_name, safe='/')}", {})
    if active() != (published.get("name"), new_name):
        fail("published release identity mismatch")
    if files(new_name) != proposed:
        fail("published manifest differs from approved manifest")
    for path, expected in raw_hashes.items():
        url_path = path[:-10] if path.endswith("index.html") else path
        response = session.get(f"https://{site}.web.app{url_path}?xpcontrast={quote(new_name, safe='')}",
                               timeout=60, allow_redirects=False)
        if response.status_code != 200 or digest(response.content) != expected:
            fail("public asset verification failed: " + path)
    if active() != (published["name"], new_name):
        fail("release changed during verification")
    report.update(deploymentPerformed=True, newRelease=published["name"],
                  newVersion=new_name, rollbackVersion=version_name, verifiedPaths=list(raw_hashes))
    (evidence / "deployed.json").write_text(json.dumps(report, indent=2) + "\n")
    print("VERIFIED four-file XP Management light-mode release", published["name"], "ROLLBACK", version_name)

if __name__ == "__main__":
    main()
