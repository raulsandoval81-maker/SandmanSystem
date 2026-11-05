#!/usr/bin/env python3
"""Read-only post-publication recovery for PR482 Run 25; never republish."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT/filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
r = load("postpublish_release", "pr482-release.py")
h = load("postpublish_hosting", "pr482-hosting.py")
a = load("postpublish_audit", "pr482-seven-hosting-readonly-preflight.py")
c, require, save = r.c, r.require, r.save
WORKFLOW = a.WORKFLOW
EXPECTED_RELEASE = "sites/sandman-combat-staging/releases/1793915483057000"
EXPECTED_VERSION = "sites/sandman-combat-staging/versions/ef4fc5628c70178f"

def protected():
    expected = {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_WORKFLOW_REF": WORKFLOW,
        "CONFIRM_PROJECT": c.PROJECT,
        "RELEASE_ACTION": "validate",
        "RELEASE_SCOPE": "run25-postpublish-readonly-audit",
    }
    require(all(os.environ.get(k) == v for k, v in expected.items()),
            "Read-only protected Run 25 audit required")
    require(os.environ.get("APPROVE_RELEASE", "") == "",
            "No deployment authorization allowed")
    require(r.manifest()["deploymentAuthorized"] is False, "Original deployment remains blocked")

def inspect(original, progress, published, source, token):
    require(published == {
        "assets": c.ASSETS,
        "productionAuthorized": False,
        "project": c.PROJECT,
        "release": EXPECTED_RELEASE,
        "rollbackVersion": "sites/sandman-combat-staging/versions/61b298b553d900ab",
        "sourceSha": c.SHA,
        "status": "STAGING_HOSTING_PUBLISHED_PENDING_BYTE_VERIFICATION",
        "version": EXPECTED_VERSION,
    }, "Run 25 partial publication receipt drift")
    require(c.baseline_digest(original) == r.manifest()["baselineSha256"],
            "Certified original baseline drift")
    require(subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"],
                                    text=True).strip() == c.SHA, "Source drift")
    funcs = {name: c.function_state(name) for name in c.FUNCTIONS}
    require(c.authorization_state(funcs) == original["authorization"],
            "Staging IAM changed during publication")
    expected_revisions = {c.FUNCTIONS[0]: a.FIRST_REVISION}
    require(progress["safe-completion.json"].get("status") ==
            "SIX_STAGING_FUNCTIONS_VERIFIED_HOSTING_NOT_PUBLISHED",
            "Run 22 completion evidence mismatch")
    for name in a.SIX:
        receipt = progress[name+"-receipt.json"]
        require(receipt.get("name") == name and receipt.get("sourceSha") == c.SHA
                and receipt.get("cloudRunReady") is True, "Run 22 function evidence invalid")
        expected_revisions[name] = receipt["revision"]
    for name in c.FUNCTIONS:
        state = funcs[name]
        require(state["function"]["serviceConfig"]["revision"] == expected_revisions[name],
                "Function revision changed: " + name)
        r.verify_cloud_run_readiness(state, expected_revisions[name])
        require(state["functionIam"] == original["functions"][name]["functionIam"]
                and state["runIam"] == original["functions"][name]["runIam"],
                "Function invoker IAM drift: " + name)
    hosting = c.hosting_state(token)
    require(hosting["release"]["name"] == EXPECTED_RELEASE
            and hosting["version"]["name"] == EXPECTED_VERSION
            and hosting["version"]["status"] == "FINALIZED",
            "Run 25 staging release is not currently published")
    before = original["hosting"]
    require(hosting["version"]["config"] == before["version"]["config"],
            "Hosting configuration changed")
    expected_manifest, blobs = h.overlay(source, before["files"])
    require(hosting["files"] == expected_manifest,
            "Run 25 published Hosting manifest does not exactly match seven approved asset changes")
    require(set(hosting["files"]) == set(before["files"]) | set(c.ASSETS),
            "Unexpected staging Hosting path")
    verified = {}
    for path in c.ASSETS:
        with urlopen("https://"+c.PROJECT+".web.app"+path+"?run25_audit="+EXPECTED_VERSION.rsplit("/",1)[-1],
                     timeout=60) as response:
            body = response.read()
        source_bytes = (Path(source)/("public"+path)).read_bytes()
        require(body == source_bytes, "Published byte mismatch: "+path)
        verified[path] = hashlib.sha256(body).hexdigest()
    return {
        "status": "RUN25_SEVEN_STAGING_HOSTING_ASSETS_VERIFIED_NO_NEW_PUBLICATION",
        "project": c.PROJECT,
        "release": EXPECTED_RELEASE,
        "version": EXPECTED_VERSION,
        "sourceSha": c.SHA,
        "assetPaths": c.ASSETS,
        "assetSha256": verified,
        "verifiedFunctionRevisions": expected_revisions,
        "iamUnchanged": True,
        "hostingConfigUnchanged": True,
        "productionAuthorized": False,
        "newDeploymentAuthorized": False,
    }

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--original", type=Path, required=True)
    p.add_argument("--run22", type=Path, required=True)
    p.add_argument("--run25", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    protected()
    token = os.environ.get("STAGING_HOSTING_TOKEN", "")
    require(bool(token), "Existing staging Hosting read token required")
    original = json.loads(args.original.read_text())
    progress = {}
    for name in ["safe-completion", *(n+"-receipt" for n in a.SIX)]:
        path = args.run22/(name+".json")
        require(path.is_file(), "Missing Run 22 evidence: "+name)
        progress[name+".json"] = json.loads(path.read_text())
    receipt = args.run25/"safe-published.json"
    require(receipt.is_file(), "Run 25 publication receipt missing")
    result = inspect(original, progress, json.loads(receipt.read_text()), args.source, token)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    save(args.out, result)
    print(result["status"])

if __name__ == "__main__":
    main()
