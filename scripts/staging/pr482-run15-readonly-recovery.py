#!/usr/bin/env python3
"""Read-only verification of the partial PR482 staging deployment from run #15.

Consumes exact run #15 evidence artifacts. Never deploys, rolls back, writes
cloud state, alters IAM, or touches Stripe/production.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("pr482_release", ROOT / "pr482-release.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
c = r.c
require = c.require
FIRST = "createProposalDraft"
RUN_ID = "42085433812"
REVISION = "createproposaldraft-00003-yen"


def verify(preflight, receipt, out, hosting_token):
    # This is evidence-specific, not a general-purpose deploy or baseline re-pin.
    m = r.manifest()
    expected_dispatch = {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        # Both permitted workflows are explicitly read-only and main-branch scoped.
        "CONFIRM_PROJECT": c.PROJECT,
    }
    require(all(os.environ.get(key) == expected for key, expected in expected_dispatch.items()),
            "Only a protected main-branch staging recovery workflow is allowed")
    permitted_workflows = {
        "raulsandoval81-maker/SandmanSystem/.github/workflows/paid-in-full-v2-readonly-preflight.yml@refs/heads/main",
        "raulsandoval81-maker/SandmanSystem/.github/workflows/pr482-six-function-readonly-preflight.yml@refs/heads/main",
    }
    require(os.environ.get("GITHUB_WORKFLOW_REF") in permitted_workflows,
            "Unapproved staging recovery audit workflow identity")
    state = json.loads((preflight / "baseline" / "baseline.json").read_text())
    require(c.baseline_digest(state) == m["baselineSha256"], "Original certified pin drift")
    original = state["functions"][FIRST]
    recorded_after = json.loads((receipt / "functions" / (FIRST + "-after.json")).read_text())
    require(recorded_after["function"]["serviceConfig"]["revision"] == REVISION,
            "Unexpected run #15 revision")
    r.compare_after(original, recorded_after)

    # Verify no newer drift, including complete IAM, Function and Cloud Run state.
    live = c.function_state(FIRST)
    require(live == recorded_after, "Live first Function no longer matches run #15 evidence")
    for name in c.FUNCTIONS:
        if name != FIRST:
            require(c.function_state(name) == state["functions"][name],
                    "Unreleased Function drift: " + name)
    require(c.authorization_state(state["functions"]) == state["authorization"],
            "Staging authorization state changed")

    source = live["function"]["buildConfig"]["source"]["storageSource"]
    require(bool(source.get("generation")), "Deployed Function source generation is unpinned")
    expected = json.loads((preflight / "packages" / (FIRST + "-files.json")).read_text())
    with tempfile.TemporaryDirectory(prefix="pr482-run15-readonly-") as folder:
        archive = Path(folder) / "deployed.zip"
        subprocess.run(["gcloud", "storage", "cp",
                        "gs://" + source["bucket"] + "/" + source["object"] +
                        "#" + str(source["generation"]), str(archive)], check=True)
        actual = r.hashes(r.contents(archive))
    require({k: v for k, v in actual.items() if k != ".gcloudignore"} ==
            {k: v for k, v in expected.items() if k != ".gcloudignore"},
            "Live deployed source archive differs from previously verified package")

    run = live["run"]
    traffic = run.get("status", {}).get("traffic", [])
    require(len(traffic) == 1 and traffic[0].get("revisionName") == REVISION and
            traffic[0].get("percent") == 100, "New revision is not receiving 100% traffic")
    require(run.get("status", {}).get("latestReadyRevisionName") == REVISION,
            "Expected revision is not ready")
    # Run #16 proved that this existing staging principal has no Cloud Logging
    # access. Do not request additional IAM or claim log/startup-probe review.
    # Cloud Run's own Ready condition is independently reported in the same
    # authenticated service description used for revision and traffic checks.
    conditions = run.get("status", {}).get("conditions", [])
    require(any(x.get("type") == "Ready" and x.get("status") == "True"
                for x in conditions), "Cloud Run service Ready condition is not True")
    require(all(x.get("status") != "False" for x in conditions
                if x.get("type") in ("Ready", "ConfigurationsReady", "RoutesReady")),
            "Cloud Run reports a failed readiness condition")

    require(bool(hosting_token), "Staging Hosting read token required")
    hosting = c.hosting_state(hosting_token)
    require(c.canonical_hosting(hosting) == c.canonical_hosting(state["hosting"]),
            "Hosting changed after partial deployment")

    summary = {
        "status": "VERIFIED_PARTIAL_STAGING_DEPLOYMENT",
        "runId": RUN_ID,
        "firstFunction": FIRST,
        "revision": REVISION,
        "originalBaselineSha256": m["baselineSha256"],
        "sourcePackageMatch": True,
        "cloudRunReady": True,
        "startupProbeLogsVerified": False,
        "startupLogReview": "NOT_PERFORMED_NO_CLOUD_LOGGING_ACCESS",
        "trafficPercent": 100,
        "otherSixFunctionsMatchOriginal": True,
        "hostingMatchesOriginal": True,
        "allIamMatchesRecordedEvidence": True,
        "deploymentAuthorized": False,
        "productionAuthorized": False,
        "nextStep": "Separate reviewed, newly pinned six-function recovery release required",
    }
    # The release audit is read-only against cloud resources; creating the
    # local GitHub Actions evidence directory is required for the receipt.
    out.parent.mkdir(parents=True, exist_ok=True)
    c.save(out, summary)
    return summary


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--preflight", required=True, type=Path)
    p.add_argument("--receipt", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()
    verify(args.preflight, args.receipt, args.out, os.environ.get("STAGING_HOSTING_TOKEN", ""))
