#!/usr/bin/env python3
"""Protected exact-seven Firebase Hosting staging release after PR482 Run 22.

Validation and publication must be distinct workflow_dispatch runs. This module
does not deploy Functions, change IAM, touch production, or process payments.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

r = load("pr482_hosting_release", "pr482-release.py")
h = load("pr482_hosting_overlay", "pr482-hosting.py")
audit = load("pr482_hosting_readonly", "pr482-seven-hosting-readonly-preflight.py")
c, require, save = r.c, r.require, r.save
APPROVAL = "APPROVE_PR482_SEVEN_HOSTING_ASSETS_STAGING_ONLY"
WORKFLOW = audit.WORKFLOW


def protected(mode):
    expected = {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_WORKFLOW_REF": WORKFLOW,
        "CONFIRM_PROJECT": c.PROJECT,
        "RELEASE_ACTION": mode,
        "RELEASE_SCOPE": "seven-hosting-controlled-release",
    }
    require(all(os.environ.get(k) == v for k, v in expected.items()),
            "Protected staging-only Hosting release required")
    require(r.manifest()["deploymentAuthorized"] is False
            and r.manifest()["productionAuthorized"] is False,
            "Original seven-Function release authorization drift")
    if mode == "deploy":
        require(os.environ.get("APPROVE_RELEASE") == APPROVAL,
                "Separate exact-seven staging Hosting approval required")
    else:
        require(os.environ.get("APPROVE_RELEASE", "") == "",
                "Validation cannot include deployment approval")


def load_progress(directory):
    progress = {}
    for name in ["safe-completion", *(n + "-receipt" for n in audit.SIX)]:
        path = Path(directory)/(name + ".json")
        require(path.is_file(), "Missing certified Run 22 receipt: " + name)
        progress[name + ".json"] = json.loads(path.read_text())
    return progress


def inspect(original, progress, source, token):
    require(c.baseline_digest(original) == r.manifest()["baselineSha256"],
            "Certified original staging baseline is invalid")
    require(token, "Existing staging Hosting read credential required")
    functions = {n: c.function_state(n) for n in c.FUNCTIONS}
    authorization = c.authorization_state(functions)
    hosting = c.hosting_state(token)
    receipt = audit.verify_live(original, progress, functions, authorization, hosting, source)
    require(receipt["assets"] == c.ASSETS
            and receipt["hostingDeploymentAuthorized"] is False
            and receipt["productionAuthorized"] is False,
            "Seven-asset verification receipt drift")
    return hosting, receipt


def assert_preflight(approved, actual):
    require(approved == actual, "Fresh Hosting baseline differs from approved separate preflight")
    require(approved.get("status") ==
            "SEVEN_HOSTING_ASSETS_PREFLIGHT_VERIFIED_NOT_AUTHORIZED",
            "Approved preflight is missing")
    require(approved.get("project") == c.PROJECT
            and approved.get("sourceSha") == c.SHA
            and approved.get("assets") == c.ASSETS
            and approved.get("hostingDeploymentAuthorized") is False,
            "Wrong staging asset scope")


def publish(source, original, progress, approved, token, out):
    # The complete preflight re-runs immediately before the first Hosting write.
    prior, actual = inspect(original, progress, source, token)
    assert_preflight(approved, actual)
    updated, blobs = h.overlay(source, prior["files"])
    require(set(updated) == set(prior["files"]) | set(c.ASSETS),
            "Hosting manifest contains an unexpected path")
    require(set(blobs) and len(blobs) == 7, "Expected exactly seven approved content blobs")
    # Every unrelated hash must be preserved, including runtime environment
    # selectors, billing dependencies and other application assets.
    require(all(updated[p] == digest for p, digest in prior["files"].items()
                if p not in c.ASSETS), "Unrelated Hosting files changed")
    version = h.request(token, "POST", f"sites/{c.PROJECT}/versions",
                        {"config": prior["version"]["config"]})
    version_name = version["name"]
    require(version_name.startswith(f"sites/{c.PROJECT}/versions/"),
            "Firebase created a version outside the staging site")
    for index in range(0, len(updated), 900):
        page = dict(list(updated.items())[index:index+900])
        response = h.request(token, "POST", version_name + ":populateFiles", {"files": page})
        required = response.get("uploadRequiredHashes", [])
        require(all(digest in blobs for digest in required),
                "Firebase requested upload of unrelated Hosting content")
        for digest in required:
            upload_url = response["uploadUrl"] + "/" + digest
            parsed = urlparse(upload_url)
            require(parsed.scheme == "https"
                    and (parsed.hostname == "firebasehosting.googleapis.com"
                         or parsed.hostname == "firebaseapphosting.googleapis.com"
                         or parsed.hostname.endswith(".googleapis.com")),
                    "Unexpected Hosting upload destination")
            req = Request(upload_url, data=blobs[digest], method="POST",
                          headers={"Authorization": "Bearer " + token,
                                   "Content-Type": "application/octet-stream"})
            with urlopen(req, timeout=90):
                pass
    finalized = h.request(token, "PATCH", version_name + "?updateMask=status",
                          {"status": "FINALIZED"})
    require(finalized.get("status") == "FINALIZED", "Hosting version was not finalized")
    # A change while uploading/finalizing must block publication.
    _, latest = inspect(original, progress, source, token)
    assert_preflight(approved, latest)
    release = h.request(token, "POST",
                        f"sites/{c.PROJECT}/releases?versionName="+quote(version_name, safe="/"),
                        {})
    require(release["name"].startswith(f"sites/{c.PROJECT}/releases/"),
            "Unexpected Hosting release identity")
    # Preserve a safe publication receipt before post-publication health checks.
    save(out/"safe-published.json", {
        "status": "STAGING_HOSTING_PUBLISHED_PENDING_BYTE_VERIFICATION",
        "project": c.PROJECT,
        "release": release["name"],
        "version": version_name,
        "rollbackVersion": prior["version"]["name"],
        "sourceSha": c.SHA, "assets": c.ASSETS,
        "productionAuthorized": False,
    })
    after = c.hosting_state(token)
    require(after["files"] == updated
            and after["version"]["config"] == prior["version"]["config"],
            "Published staging Hosting manifest or config mismatch")
    for path in c.ASSETS:
        url = f"https://{c.PROJECT}.web.app" + path + "?pr482_release=" + version_name.rsplit("/", 1)[-1]
        with urlopen(url, timeout=60) as response:
            body = response.read()
        require(body == (Path(source)/("public"+path)).read_bytes(),
                "Staging published asset bytes mismatch: " + path)
    verified = {
        "status": "SEVEN_STAGING_HOSTING_ASSETS_VERIFIED",
        "project": c.PROJECT, "sourceSha": c.SHA,
        "release": release["name"], "version": version_name,
        "rollbackVersion": prior["version"]["name"],
        "assets": c.ASSETS, "productionAuthorized": False,
    }
    save(out/"safe-verified.json", verified)
    return verified


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["validate", "deploy"])
    parser.add_argument("--source", required=True)
    parser.add_argument("--original", type=Path, required=True)
    parser.add_argument("--run22", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--approved-preflight", type=Path)
    args = parser.parse_args()
    protected(args.mode)
    require(subprocess.check_output(["git", "-C", args.source, "rev-parse", "HEAD"],
                                    text=True).strip() == c.SHA,
            "Immutable reviewed PR482 source required")
    original = json.loads(args.original.read_text())
    progress = load_progress(args.run22)
    token = os.environ.get("STAGING_HOSTING_TOKEN", "")
    args.out.mkdir(parents=True, exist_ok=False)
    if args.mode == "validate":
        _, receipt = inspect(original, progress, args.source, token)
        save(args.out/"safe-preflight.json", receipt)
        print("SEVEN_HOSTING_CONTROLLED_VALIDATION_ONLY_NO_DEPLOYMENT")
        return
    require(args.approved_preflight is not None
            and args.approved_preflight.is_file(),
            "Separate approved preflight receipt required")
    approved = json.loads(args.approved_preflight.read_text())
    # Fail closed on the approved exact live Hosting digest.
    _, current = inspect(original, progress, args.source, token)
    assert_preflight(approved, current)
    publish(args.source, original, progress, approved, token, args.out)


if __name__ == "__main__":
    main()
