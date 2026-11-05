#!/usr/bin/env python3
"""Non-authorizing PR482 Hosting preflight after protected six-Function recovery.

No Hosting writes, IAM writes, deployment, or production access.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

r = load("hosting_release", "pr482-release.py")
h = load("hosting_overlay", "pr482-hosting.py")
c, require, save = r.c, r.require, r.save
FIRST_REVISION = "createproposaldraft-00003-yen"
SIX = c.FUNCTIONS[1:]
WORKFLOW = "raulsandoval81-maker/SandmanSystem/.github/workflows/paid-in-full-v2-readonly-preflight.yml@refs/heads/main"


def protected():
    expected = {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_WORKFLOW_REF": WORKFLOW,
        "CONFIRM_PROJECT": c.PROJECT,
        "RELEASE_ACTION": "validate",
        "RELEASE_SCOPE": "seven-hosting-readonly-preflight",
    }
    require(all(os.environ.get(k) == v for k, v in expected.items()),
            "Protected staging-only read-only Hosting dispatch required")
    require(os.environ.get("APPROVE_RELEASE", "") == "",
            "No deployment approval permitted in Hosting preflight")
    require(r.manifest()["deploymentAuthorized"] is False,
            "Original seven-Function deployment must remain disabled")


def verify_live(original, progress, function_state, authorization, hosting, source):
    require(progress.get("safe-completion.json", {}).get("status") ==
            "SIX_STAGING_FUNCTIONS_VERIFIED_HOSTING_NOT_PUBLISHED",
            "Run 22 verified six-Function completion missing")
    done = progress["safe-completion.json"]
    require(done.get("project") == c.PROJECT and done.get("sourceSha") == c.SHA
            and done.get("functions") == SIX
            and done.get("preservedFunction") == c.FUNCTIONS[0]
            and done.get("productionAuthorized") is False,
            "Run 22 completed scope incorrect")
    require(set(function_state) == set(c.FUNCTIONS),
            "Full seven-Function staging inventory required")
    require(authorization == original["authorization"],
            "IAM drift since original certified baseline")
    require(c.canonical_hosting(hosting) == c.canonical_hosting(original["hosting"]),
            "Staging Hosting changed since original certified baseline")
    expected = {c.FUNCTIONS[0]: FIRST_REVISION}
    for name in SIX:
        receipt = progress.get(name + "-receipt.json")
        require(receipt is not None and receipt.get("name") == name
                and receipt.get("sourceSha") == c.SHA
                and receipt.get("cloudRunReady") is True
                and receipt.get("productionAuthorized") is False
                and receipt.get("deploymentAuthorized") is True,
                "Missing verified Run 22 Function receipt: " + name)
        expected[name] = receipt["revision"]
    for name, revision in expected.items():
        state = function_state[name]
        require(state["function"]["serviceConfig"]["revision"] == revision,
                "Staging revision drift: " + name)
        r.verify_cloud_run_readiness(state, revision)
        require(state["functionIam"] == original["functions"][name]["functionIam"]
                and state["runIam"] == original["functions"][name]["runIam"],
                "Function invoker IAM drift: " + name)
    require(subprocess.check_output(
        ["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip() == c.SHA,
        "Wrong immutable approved PR482 source")
    dep = Path(source)/"public/management/billing/prepaid-terms.js"
    require(dep.is_file(), "Required unchanged prepaid terms dependency missing")
    import gzip
    require(hashlib.sha256(gzip.compress(dep.read_bytes(), mtime=0)).hexdigest() ==
            hosting["files"]["/management/billing/prepaid-terms.js"],
            "Prepaid terms dependency changed")
    updated, blobs = h.overlay(source, hosting["files"])
    changed = [path for path in c.ASSETS
               if hosting["files"].get(path) != updated[path]]
    require(changed == c.ASSETS and len(blobs) == 7,
            "Hosting overlay is not exactly seven approved changed assets")
    require(all(updated[k] == value for k, value in hosting["files"].items()
                if k not in c.ASSETS), "Unrelated Hosting asset change")
    return {
        "status": "SEVEN_HOSTING_ASSETS_PREFLIGHT_VERIFIED_NOT_AUTHORIZED",
        "project": c.PROJECT, "sourceSha": c.SHA,
        "hostingBaselineSha256": c.digest(c.canonical_hosting(hosting)),
        "assets": c.ASSETS,
        "verifiedFunctionRevisions": expected,
        "hostingDeploymentAuthorized": False,
        "productionAuthorized": False,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--original", type=Path, required=True)
    p.add_argument("--run22", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    protected()
    original = json.loads(args.original.read_text())
    require(c.baseline_digest(original) == r.manifest()["baselineSha256"],
            "Original certified baseline hash drift")
    progress = {}
    for name in ["safe-completion", *(n+"-receipt" for n in SIX)]:
        path = args.run22/(name+".json")
        require(path.is_file(), "Missing Run 22 evidence: "+name)
        progress[name+".json"] = json.loads(path.read_text())
    token = os.environ.get("STAGING_HOSTING_TOKEN", "")
    require(bool(token), "Existing staging Hosting read credential required")
    live_functions = {n: c.function_state(n) for n in c.FUNCTIONS}
    auth = c.authorization_state(live_functions)
    hosting = c.hosting_state(token)
    result = verify_live(original, progress, live_functions, auth, hosting, args.source)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    save(args.out, result)
    print("SEVEN_HOSTING_READONLY_PREFLIGHT_VERIFIED_NO_DEPLOYMENT")


if __name__ == "__main__":
    main()
