#!/usr/bin/env python3
"""Strictly gated six-Function PR482 staging recovery. Never touches Hosting/IAM.

Deploy mode is only callable from the existing protected staging workflow,
with a separate owner approval and a certified read-only preflight receipt.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

r = load("pr482_six_release_original", "pr482-release.py")
candidate = load("pr482_six_release_candidate", "pr482-six-function-candidate.py")
c, require, save = r.c, r.require, r.save
SIX = c.FUNCTIONS[1:]
FIRST = c.FUNCTIONS[0]
APPROVAL = "APPROVE_PR482_SIX_FUNCTION_STAGING_ONLY"
WORKFLOW = "raulsandoval81-maker/SandmanSystem/.github/workflows/paid-in-full-v2-readonly-preflight.yml@refs/heads/main"


def protected(deploy=False):
    expected = {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_WORKFLOW_REF": WORKFLOW,
        "CONFIRM_PROJECT": c.PROJECT,
    }
    require(all(os.environ.get(key) == value for key, value in expected.items()),
            "Only the existing protected staging workflow may run six-Function recovery")
    require(r.manifest()["deploymentAuthorized"] is False
            and r.manifest()["productionAuthorized"] is False,
            "Original release authorization changed")
    if deploy:
        require(os.environ.get("RELEASE_ACTION") == "deploy"
                and os.environ.get("RELEASE_SCOPE") == "six-function-controlled-release"
                and os.environ.get("APPROVE_RELEASE") == APPROVAL,
                "Explicit six-Function staging-only approval required")


def validate_evidence(original, first_after, audit, plan, baseline):
    state = json.loads((Path(baseline)/"baseline.json").read_text())
    receipt = json.loads((Path(baseline)/"receipt.json").read_text())
    candidate.verify_candidate_capture(original, first_after, audit, state, receipt, plan)
    return state, receipt


def summary(state, receipt):
    return {
        "status": "SIX_FUNCTION_PREFLIGHT_VERIFIED_NOT_AUTHORIZED",
        "project": c.PROJECT,
        "sourceSha": c.SHA,
        "baselineSha256": c.baseline_digest(state),
        "functions": SIX,
        "preservedFunction": FIRST,
        "deploymentAuthorized": False,
        "productionAuthorized": False,
    }


def verify_preflight_record(record, state):
    require(record == summary(state, {"baselineSha256": c.baseline_digest(state)}),
            "Latest staging capture differs from separately approved preflight")


def expected_function_state(name, original, first_after, verified):
    if name == FIRST:
        return first_after
    if name in verified:
        return verified[name]
    return original["functions"][name]


def verify_live_before_step(original, first_after, verified, hosting_token):
    require(c.authorization_state(original["functions"]) == original["authorization"],
            "Authorization drift before deployment")
    require(c.canonical_hosting(c.hosting_state(hosting_token))
            == c.canonical_hosting(original["hosting"]),
            "Hosting drift before deployment")
    for name in c.FUNCTIONS:
        require(c.function_state(name)
                == expected_function_state(name, original, first_after, verified),
                "Unexpected staging Function state: " + name)


def verify_candidate_files(name, package_dir):
    require(name in SIX, "First Function or unrelated Function cannot be deployed")
    prepared = json.loads((Path(package_dir)/"prepared.json").read_text())
    require(prepared["candidateOnly"] is True
            and prepared["functions"] == SIX
            and prepared["sourceSha"] == c.SHA,
            "Unapproved Function package receipt")
    folder = Path(package_dir)/name
    files = {str(p.relative_to(folder)): p.read_bytes()
             for p in folder.rglob("*") if p.is_file()}
    require(files and r.hashes(files)
            == json.loads((Path(package_dir)/(name+"-files.json")).read_text()),
            "Candidate source hashes do not match")
    return folder, files


def deploy_one(name, original, first_after, verified, package_dir,
               evidence_dir, hosting_token):
    protected(True)
    require(name in SIX and name not in verified, "Invalid deployment order or scope")
    require(name == SIX[len(verified)], "Function deployment must be strictly sequential")
    verify_live_before_step(original, first_after, verified, hosting_token)
    folder, files = verify_candidate_files(name, package_dir)
    before = original["functions"][name]
    f = before["function"]
    service, build = f["serviceConfig"], f["buildConfig"]
    require(service["ingressSettings"] == "ALLOW_ALL", "Unexpected ingress")
    cmd = [
        "gcloud", "functions", "deploy", name, "--gen2",
        "--project="+c.PROJECT, "--region="+c.REGION,
        "--runtime=nodejs22", "--entry-point="+name,
        "--source="+str(folder.resolve()),
        "--run-service-account="+service["serviceAccountEmail"],
        "--build-service-account="+build["serviceAccount"],
        "--cpu="+service["availableCpu"], "--memory="+service["availableMemory"],
        "--timeout="+str(service["timeoutSeconds"])+"s",
        "--max-instances="+str(service["maxInstanceCount"]),
        "--concurrency="+str(service["maxInstanceRequestConcurrency"]),
        "--ingress-settings=all", "--quiet",
    ]
    require("--project="+c.PROJECT in cmd and "--region="+c.REGION in cmd,
            "Project/region scope drift")
    subprocess.run(cmd, check=True)
    after = c.function_state(name)
    r.compare_after(before, after)
    src = after["function"]["buildConfig"]["source"]["storageSource"]
    require(bool(src.get("generation")), "Missing immutable deployed source")
    archive = Path(evidence_dir)/(name+"-deployed.zip")
    subprocess.run(["gcloud", "storage", "cp",
                    f"gs://{src['bucket']}/{src['object']}#{src['generation']}",
                    str(archive)], check=True)
    uploaded = r.hashes(r.contents(archive))
    expected = r.hashes(files)
    require({k:v for k,v in uploaded.items() if k != ".gcloudignore"}
            == {k:v for k,v in expected.items() if k != ".gcloudignore"},
            "Deployed source differs from verified candidate")
    revision = after["function"]["serviceConfig"]["revision"]
    r.verify_cloud_run_readiness(after, revision)
    verified[name] = after
    save(Path(evidence_dir)/(name+"-receipt.json"), {
        "name": name, "revision": revision, "sourceSha": c.SHA,
        "packageSha256": hashlib.sha256(
            json.dumps(expected, sort_keys=True).encode()).hexdigest(),
        "cloudRunReady": True, "startupProbeLogsVerified": False,
        "deploymentAuthorized": True, "productionAuthorized": False,
    })
    return after


def complete(original, first_after, verified, hosting_token):
    require(list(verified) == SIX, "Not all six Functions have been verified in order")
    verify_live_before_step(original, first_after, verified, hosting_token)
    return {
        "status": "SIX_STAGING_FUNCTIONS_VERIFIED_HOSTING_NOT_PUBLISHED",
        "sourceSha": c.SHA, "project": c.PROJECT,
        "functions": SIX, "preservedFunction": FIRST,
        "productionAuthorized": False,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["preflight", "deploy"])
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--original", type=Path, required=True)
    p.add_argument("--run15-after", type=Path, required=True)
    p.add_argument("--audit", type=Path, required=True)
    p.add_argument("--plan", type=Path, required=True)
    p.add_argument("--fresh-baseline", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--approved-preflight", type=Path)
    args = p.parse_args()
    protected(args.mode == "deploy")
    require(subprocess.check_output(
        ["git", "-C", str(args.source), "rev-parse", "HEAD"],
        text=True).strip() == c.SHA, "Unreviewed application source")
    original = json.loads(args.original.read_text())
    first_after = json.loads(args.run15_after.read_text())
    audit = json.loads(args.audit.read_text())
    plan = json.loads(args.plan.read_text())
    state, receipt = validate_evidence(
        original, first_after, audit, plan, args.fresh_baseline)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.mode == "deploy":
        require(args.approved_preflight is not None and args.approved_preflight.is_file(),
                "Separate successful preflight evidence is required")
        approved = json.loads(args.approved_preflight.read_text())
        verify_preflight_record(approved, state)
    candidate_dir = out/"packages"
    r.package(args.source, args.fresh_baseline, candidate_dir,
              candidate=True, selected_functions=SIX)
    require(json.loads((candidate_dir/"prepared.json").read_text())
            == {"sourceSha": c.SHA, "baselineSha256": receipt["baselineSha256"],
                "functions": SIX, "candidateOnly": True},
            "Six-Function candidate preparation failed")
    if args.mode == "preflight":
        save(out/"safe-preflight.json", summary(state, receipt))
        return
    token = os.environ.get("STAGING_HOSTING_TOKEN", "")
    require(bool(token), "Existing staging Hosting read credential required")
    verified = {}
    for name in SIX:
        deploy_one(name, state, first_after, verified,
                   candidate_dir, out, token)
    save(out/"safe-completion.json", complete(state, first_after, verified, token))


if __name__ == "__main__":
    main()
