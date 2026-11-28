#!/usr/bin/env python3
"""Offline Sprint 1 staging candidate validator. No cloud requests, no deployment."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

MANIFEST = Path(__file__).with_name("release-manifest.json")
SOURCE_SHA = "0e9d96e3994094fffacbb606ac77f474902bf666"
PROJECT = "sandman-combat-staging"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def verify_evidence(manifest, raw):
    require(sha(raw) == manifest["preflight"]["evidenceSha256"], "Baseline evidence bytes differ")
    evidence = json.loads(raw)
    snapshot = evidence["snapshot"]
    require(evidence["status"] == "PASS_READ_ONLY" and evidence["operation"] == "GET_ONLY_PREFLIGHT"
            and evidence["deployAuthorized"] is False, "Invalid read-only evidence")
    require(evidence["environment"] == PROJECT and snapshot["project"] == PROJECT and
            snapshot["projectNumber"] == manifest["projectNumber"], "Staging project mismatch")
    require(evidence["sourceSha"] == SOURCE_SHA, "Source SHA mismatch")
    baseline = manifest["expectedBaseline"]
    current = {
        "firestoreRelease": snapshot["firestore"]["release"],
        "firestoreRuleset": snapshot["firestore"]["ruleset"],
        "firestoreSourceFilesSha256": snapshot["firestore"]["sourceFilesSha256"],
        "hostingRelease": snapshot["hosting"]["release"],
        "hostingVersion": snapshot["hosting"]["version"],
        "hostingConfigSha256": snapshot["hosting"]["configSha256"],
        "hostingManifestSha256": snapshot["hosting"]["manifestSha256"],
        "hostingFileCount": snapshot["hosting"]["fileCount"],
        "functionsCount": snapshot["functions"]["count"],
    }
    require(current == baseline, "Staging baseline snapshot mismatch")
    require(evidence["localSourceHashes"] == manifest["sourceFilesSha256"], "Source hash list mismatch")
    require(snapshot["hosting"]["sprint1TargetCurrentHashes"] == manifest["baselineHostingHashes"],
            "Hosting target baseline mismatch")
    hosting = manifest["hostingPaths"]
    require(len(hosting) == 18 and len(set(hosting)) == 18
            and set(hosting) == set(manifest["baselineHostingHashes"]), "Hosting allowlist mismatch")
    require(all(p.startswith("/") and ".." not in p and "\\" not in p for p in hosting),
            "Unsafe Hosting path")
    functions = snapshot["functions"]["inventory"]
    require(len(functions) == snapshot["functions"]["count"] == 53, "Function inventory mismatch")
    require(all(item["state"] == "ACTIVE" for item in functions), "Inactive existing Function")
    existing = {item["name"].split("/")[-1] for item in functions}
    proposed = {item["name"] for item in manifest["functions"]}
    require(proposed == {"getAthleteProfileFeed", "getAthleteSkillsSummary"} and
            len(manifest["functions"]) == 2 and existing.isdisjoint(proposed),
            "Unexpected Function scope or Function already exists")
    require(all(item["mode"] == "create-only" and item["generation"] == "v2"
                and item["region"] == "us-central1" for item in manifest["functions"]),
            "Function scope guard failed")
    require(manifest["status"] == "PREPARATION_ONLY_NO_DEPLOYMENT" and
            manifest["deploymentAuthorized"] is False and
            manifest["productionAuthorized"] is False, "Unauthorized release status")
    require(manifest["project"] == PROJECT and manifest["sourceSha"] == SOURCE_SHA and
            manifest["rulesPath"] == "scripts/staging/p0-containment/firestore.rules", "Manifest identity changed")
    require(manifest["releaseOrder"] ==
            ["functions", "firestore-rules", "hosting", "authenticated-staging-acceptance"],
            "Release order changed")
    return {"status": "PASS_OFFLINE_EVIDENCE_ONLY", "functionsAbsent": 2,
            "hostingPaths": len(hosting), "newHostingPaths":
            sum(value is None for value in manifest["baselineHostingHashes"].values())}


def verify_source(manifest, root):
    require((root / ".git").exists(), "Git source root required")
    require(subprocess.run(["git", "-C", str(root), "merge-base", "--is-ancestor",
                            SOURCE_SHA, "HEAD"], check=False).returncode == 0,
            "Tested Sprint 1 commit is not an ancestor")
    paths = list(manifest["sourceFilesSha256"])
    require(subprocess.run(["git", "-C", str(root), "diff", "--quiet", SOURCE_SHA,
                            "HEAD", "--", *paths], check=False).returncode == 0,
            "Releasable source drift")
    for name, expected in manifest["sourceFilesSha256"].items():
        path = root / name
        require(path.is_file() and sha(path.read_bytes()) == expected,
                "Source mismatch: " + name)
    index = (root / "functions/src/index.ts").read_text()
    for item in manifest["functions"]:
        require(re.search(r"\b" + re.escape(item["name"]) + r"\b", index) is not None,
                "Missing callable export")
    require((root / "functions/lib/modules/athlete/getAthleteProfileFeed.js").is_file()
            and (root / "functions/lib/modules/athlete/getAthleteSkillsSummary.js").is_file(),
            "Missing compiled callable")
    return {"status": "PASS_SOURCE_EQUIVALENCE", "pinnedPaths": len(paths)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", required=True, type=Path,
                        help="Extracted JSON from protected run #46086011747")
    parser.add_argument("--source-root", type=Path)
    args = parser.parse_args()
    try:
        manifest = json.loads(MANIFEST.read_text())
        result = {"evidence": verify_evidence(manifest, args.evidence.read_bytes())}
        if args.source_root is not None:
            result["source"] = verify_source(manifest, args.source_root.resolve())
        print(json.dumps({"checks": result, "deploymentAuthorized": False}, indent=2))
        return 0
    except (ValueError, KeyError, FileNotFoundError, TypeError, json.JSONDecodeError) as exc:
        print("STOP_NO_RETRY: offline candidate verification failed: " + type(exc).__name__,
              file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
