"""Fail-closed continuation of Run #347. Staging only; no replay of updated Functions."""
import json
import io
import zipfile
import os
from pathlib import Path
import subprocess
import sys
import urllib.parse

import importlib.util

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("pr614_original", HERE / "pr614-staging-deploy.py")
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)

require = original.require
inventory = original.inventory
release = original.release
SHA = original.SHA
PROJECT = original.PROJECT
ACTION = "pr614-staging-continue"
APPROVAL = "APPROVE_PR614_STAGING_CONTINUE_FOUR_FUNCTIONS_RULES_PREPARED_HOSTING"
PREPARED_HOSTING = "sites/sandman-combat-staging/versions/32d5bddfa69e2f06"
RULES_BASELINE = "projects/sandman-combat-staging/rulesets/355a737b-7aec-4a6f-88e4-6439fa38df66"

# Verified Run #347 revisions. The exact value for every Function must match.
ALREADY_UPDATED = {
    "approveAndActivate": "00004-dec",
    "sendProposalPrepaidCashReceipt": "00004-wuj",
    "sendEnrollmentIntakeEmail": "7",
    "hydrateEnrollmentIntakePrefill": "00003-wiz",
}
REMAINING = {
    "approveIntakeCall": "00001-tul",
    "acceptProposalClientReview": "00004-diw",
    "issueProposalEnrollmentHandoff": "00001-jem",
    "saveProposalEnrollmentAgreement": "00003-jek",
}
require(set(ALREADY_UPDATED) | set(REMAINING) == set(original.FUNCTIONS),
        "Unexpected continuation Function scope")
require(not (set(ALREADY_UPDATED) & set(REMAINING)), "Overlapping Function scope")


def guard(env):
    expected = {
        "GITHUB_REPOSITORY": inventory.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW,
        "REQUESTED_ACTION": ACTION,
        "CONFIRM_PROJECT": PROJECT,
        "CONFIRM_SHA": SHA,
        "DEPLOY_APPROVAL": APPROVAL,
        "EXPECTED_HOSTING_RELEASE": "sites/sandman-combat-staging/releases/1794258558062000",
        "EXPECTED_HOSTING_VERSION": "sites/sandman-combat-staging/versions/8f33ab588a8c7fdd",
    }
    for key, value in expected.items():
        require(env.get(key) == value, f"Unexpected {key}")


def expected_revision(name, config):
    if original.FUNCTIONS[name] == 1:
        return str(config["function"]["versionId"])
    return config["transport"]["run"]["latestReadyRevision"].rsplit("/", 1)[-1].removeprefix(name.lower() + "-")


def verify_snapshot(name, config, entry):
    require(inventory.redact(config["function"]) == entry["configuration"],
            f"{name}: Function configuration changed after preflight")
    require(config["transport"]["functions"] == entry["iam"],
            f"{name}: Function IAM changed after preflight")
    if original.FUNCTIONS[name] == 2:
        require(inventory.redact(config["transport"]["run"]) == entry["run"],
                f"{name}: Cloud Run configuration changed after preflight")
        require(config["transport"]["runIam"] == entry["runIam"],
                f"{name}: Cloud Run IAM changed after preflight")


def archive_file_digests(content):
    """Compare exact source contents; ZIP metadata is not part of executable source."""
    inventory.archive_evidence(content)
    with zipfile.ZipFile(io.BytesIO(content)) as package:
        names = package.namelist()
        require(len(names) == len(set(names)) and all(
            name and not name.startswith("/") and "\\\\" not in name and
            ".." not in Path(name).parts and not name.endswith("/")
            for name in names), "Source ZIP has duplicate, unsafe, or directory entries")
        return {name: inventory.sha(package.read(name)) for name in names}


def verify_deployed_archive(name, deployed, reviewed):
    actual = archive_file_digests(deployed)
    expected = archive_file_digests(reviewed)
    require(actual == expected,
            f"{name}: deployed source file mismatch; only-deployed="
            f"{sorted(set(actual) - set(expected))}; only-reviewed="
            f"{sorted(set(expected) - set(actual))}; changed="
            f"{sorted(k for k in actual.keys() & expected.keys() if actual[k] != expected[k])}")


def prepared_manifest(evidence):
    hosting = evidence["hostingRollback"]
    require(hosting["release"] == os.environ["EXPECTED_HOSTING_RELEASE"] and
            hosting["version"] == os.environ["EXPECTED_HOSTING_VERSION"],
            "Owner-approved Hosting rollback baseline changed")
    require(set(hosting["changedPaths"]) == set(original.ASSETS),
            "Unexpected Hosting asset scope")
    return hosting


def main():
    guard(os.environ)
    require(subprocess.check_output(["git", "-C", "pr614-candidate", "rev-parse", "HEAD"],
                                    text=True).strip() == SHA, "Pinned application SHA changed")
    evidence = json.loads(Path("pr614-preflight.json").read_text())
    require(not evidence.get("errors") and set(evidence.get("functions", {})) == set(original.FUNCTIONS),
            "Fresh corrected preflight did not pass")
    hosting = prepared_manifest(evidence)
    rules = evidence["firestoreRollback"]
    require(rules["ruleset"] == RULES_BASELINE and
            rules["release"] == f"projects/{PROJECT}/releases/cloud.firestore",
            "Run #347 Rules baseline changed")
    archive = Path(os.environ["CANDIDATE_PACKAGE"]).read_bytes()
    inventory.archive_evidence(archive)
    functions_token = inventory.command("Acquire Function credentials",
                                         ["gcloud", "auth", "print-access-token"]).decode().strip()
    platform_token = inventory.hosting_access_token(os.environ)
    live = {name: release.function_config(name, functions_token) for name in original.FUNCTIONS}
    for name, config in live.items():
        verify_snapshot(name, config, evidence["functions"][name])
        expected = {**ALREADY_UPDATED, **REMAINING}[name]
        require(expected_revision(name, config) == expected,
                f"{name}: not at recorded Run #347 revision ({expected})")
    # All four previously updated source packages must match before any write.
    for name in ALREADY_UPDATED:
        verify_deployed_archive(name, original.deployed_source(name, live[name], functions_token), archive)
    first_asset = Path("pr614-candidate/public" + original.ASSETS[0]).read_bytes()
    active_hosting = original.current_hosting(platform_token, first_asset)
    require(all(active_hosting[key] == hosting[key] for key in ("release", "version", "manifest", "config")),
            "Active Hosting baseline changed")
    rules_now = original.get("Check active Rules", original.RULES_API + rules["release"], platform_token)
    require(rules_now.get("rulesetName") == RULES_BASELINE, "Active Rules changed")
    # Reuse exactly the already FINALIZED, unactivated version from Run #347.
    original.verify_hosting_version(PREPARED_HOSTING, hosting["config"], hosting["proposed"], platform_token)
    completed = []
    ruleset = None
    hosting_release = None
    try:
        for name in REMAINING:
            require(release.function_config(name, functions_token) == live[name],
                    f"{name}: modified since preflight")
            release.source_update(name, archive, functions_token)
            completed.append(name)
            after = release.function_config(name, functions_token)
            require(original.preserved_runtime_config(after) ==
                    original.preserved_runtime_config(live[name]),
                    f"{name}: runtime identity, IAM, secrets, or transport changed")
            verify_deployed_archive(name, original.deployed_source(name, after, functions_token), archive)
        for name in ALREADY_UPDATED:
            after = release.function_config(name, functions_token)
            require(after == live[name], f"{name}: previously updated Function changed")
        require(original.get("Recheck Rules", original.RULES_API + rules["release"],
                             platform_token).get("rulesetName") == RULES_BASELINE,
                "Rules changed before activation")
        ruleset = original.deploy_rules(Path("pr614-candidate/firestore.rules").read_text(),
                                        rules, platform_token)
        require(original.get("Verify Rules", original.RULES_API + rules["release"],
                             platform_token).get("rulesetName") == ruleset, "New Rules not active")
        original.verify_hosting_version(PREPARED_HOSTING, hosting["config"],
                                        hosting["proposed"], platform_token)
        active = original.current_hosting(platform_token, first_asset)
        require(active["release"] == hosting["release"] and active["version"] == hosting["version"],
                "Hosting baseline changed before publish")
        query = urllib.parse.urlencode({"versionName": PREPARED_HOSTING})
        hosting_release = original.write("Activate verified prepared Hosting",
                                         original.HOSTING_API + original.SITE + "/releases?" + query,
                                         "POST", {}, platform_token)["name"]
        active = original.get("Verify active Hosting",
                              original.HOSTING_API + original.SITE + "/releases?pageSize=1", platform_token)
        require(active["releases"][0]["name"] == hosting_release and
                active["releases"][0]["version"]["name"] == PREPARED_HOSTING,
                "Prepared Hosting version not active")
        for path in original.ASSETS:
            body = inventory.read("Verify live approved Hosting asset",
                                  f"https://{PROJECT}.web.app{path}?" +
                                  urllib.parse.urlencode({"release": hosting_release}))
            require(inventory.sha(body) ==
                    inventory.sha(Path("pr614-candidate/public" + path).read_bytes()),
                    f"Live Hosting asset differs: {path}")
    except Exception:
        print(json.dumps({"STOP_NO_RETRY": True, "updatedInContinuation": completed,
                          "rulesActivated": ruleset, "hostingRelease": hosting_release,
                          "rulesRollback": RULES_BASELINE,
                          "hostingRollback": hosting["version"]}), flush=True)
        raise
    result = {"applicationSha": SHA, "previouslyUpdated": list(ALREADY_UPDATED),
              "updatedInContinuation": completed, "ruleset": ruleset,
              "hostingRelease": hosting_release, "hostingVersion": PREPARED_HOSTING,
              "run347Recovery": True}
    Path("pr614-continue-result.json").write_text(json.dumps(result, sort_keys=True, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    if sys.argv[1:] == ["--guard-only"]:
        guard(os.environ)
    elif sys.argv[1:] == ["--package"]:
        guard(os.environ)
        # The reviewed package builder is unchanged; it has its own original exact-action guard.
        os.environ["REQUESTED_ACTION"] = original.ACTION
        os.environ["DEPLOY_APPROVAL"] = original.APPROVAL
        original.package()
    else:
        require(not sys.argv[1:], "Unexpected continuation arguments")
        main()
