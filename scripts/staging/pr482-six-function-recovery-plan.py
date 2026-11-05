#!/usr/bin/env python3
"""Build a non-authorizing six-Function recovery plan from immutable audit evidence.

This tool is offline only. It neither updates the original seven-function
release manifest nor authorizes deployment. Fresh staging drift verification,
newly pinned packages, and separate approval are still required.
"""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("pr482_release", ROOT / "pr482-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
require = release.require
FIRST = "createProposalDraft"
RUN15 = "42085433812"
RUN18 = "42098768695"
REVISION = "createproposaldraft-00003-yen"


def plan_from_evidence(original, partial, audit):
    """Verify exact historic recovery evidence; NEVER treat it as live authorization."""
    manifest = release.manifest()
    require(manifest["deploymentAuthorized"] is False
            and manifest["productionAuthorized"] is False, "Unexpected authorization")
    require(manifest["functions"][0] == FIRST
            and len(manifest["functions"]) == 7
            and len(set(manifest["functions"])) == 7, "Unexpected seven-Function scope")
    require(release.c.baseline_digest(original) == manifest["baselineSha256"],
            "Original immutable staging baseline does not match pinned digest")
    require(original.get("project") == release.c.PROJECT
            and original.get("applicationSha") == release.c.SHA,
            "Original source/project boundary changed")
    require(set(original["functions"]) == set(manifest["functions"]),
            "Original Function inventory changed")
    expected_first = partial["function"]["serviceConfig"]["revision"]
    require(expected_first == REVISION, "Run 15 Function revision mismatch")
    release.compare_after(original["functions"][FIRST], partial)
    expected_audit = {
        "status": "VERIFIED_PARTIAL_STAGING_DEPLOYMENT",
        "runId": RUN15,
        "firstFunction": FIRST,
        "revision": REVISION,
        "originalBaselineSha256": manifest["baselineSha256"],
        "sourcePackageMatch": True,
        "cloudRunReady": True,
        "startupProbeLogsVerified": False,
        "trafficPercent": 100,
        "otherSixFunctionsMatchOriginal": True,
        "hostingMatchesOriginal": True,
        "allIamMatchesRecordedEvidence": True,
        "deploymentAuthorized": False,
        "productionAuthorized": False,
    }
    require(all(audit.get(key) == expected for key, expected in expected_audit.items()),
            "Run 18 verified recovery receipt is missing a required check")
    require(audit.get("startupLogReview") == "NOT_PERFORMED_NO_CLOUD_LOGGING_ACCESS",
            "Startup-log evidence incorrectly claimed")
    remaining = [name for name in manifest["functions"] if name != FIRST]
    require(len(remaining) == 6, "Six-Function scope not established")
    return {
        "status": "RECOVERY_PLAN_ONLY_NOT_AUTHORIZED",
        "project": release.c.PROJECT,
        "applicationSha": release.c.SHA,
        "originalBaselineSha256": manifest["baselineSha256"],
        "readOnlyAuditRunId": RUN18,
        "partialDeployRunId": RUN15,
        "preservedFunction": FIRST,
        "preservedRevision": REVISION,
        "functionsToPrepare": remaining,
        "hostingAssetsToPrepare": manifest["assets"],
        "requiredBeforeDeploy": [
            "Fresh live staging drift audit against certified partial state",
            "New immutable six-Function packaging and baseline evidence",
            "Protected staging release with explicit six-Function scope",
            "Separate owner approval and passing CI",
        ],
        "deploymentAuthorized": False,
        "productionAuthorized": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--original-baseline", required=True, type=Path)
    parser.add_argument("--run15-first-after", required=True, type=Path)
    parser.add_argument("--run18-audit", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    plan = plan_from_evidence(
        json.loads(args.original_baseline.read_text()),
        json.loads(args.run15_first_after.read_text()),
        json.loads(args.run18_audit.read_text()),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(plan, sort_keys=True, indent=2) + "\n")


if __name__ == "__main__":
    main()
