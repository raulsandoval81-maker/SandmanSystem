"""Protected, read-only staging preflight for the reviewed enrollment handoff."""
import json
import os
from pathlib import Path
import subprocess

import receipt_intake_release as release

REPO = "raulsandoval81-maker/SandmanSystem"
PROJECT = "sandman-combat-staging"
ACCOUNT = f"sandman-practice-deployer@{PROJECT}.iam.gserviceaccount.com"
NAME = "issueProposalEnrollmentHandoff"
SHA = "a2d716eb4a54d022ff403f6860138861465b8cda"
CORE = "77949da45bfd9c4f9f1e3aa514d523be54779e86"
FILES_SHA = "9a9ec9e5f3f25fc99bb2148004328caaf51c27527471e83d4d01a0fdf40e39ee"
require = release.require


def guard(env):
    for key, expected in {
        "GITHUB_REPOSITORY": REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": f"{REPO}/.github/workflows/staging-exact-sha-release.yml@refs/heads/main",
        "GITHUB_RUN_ATTEMPT": "1",
        "HANDOFF_ACTION": "handoff-preflight",
        "CONFIRM_PROJECT": PROJECT,
        "CONFIRM_SHA": SHA,
    }.items():
        require(env.get(key) == expected, f"Staging guard: {key}")


def package():
    candidate, core = Path("candidate"), Path("staging-core")
    for root, sha in ((candidate, SHA), (core, CORE)):
        actual = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
        require(actual == sha, "Staging package checkout SHA differs")
    correction = json.loads((candidate / "scripts/production/receipt_intake_release.json").read_text())[
        "pendingHandoffCorrection"]
    path = Path("functions/src/proposals/issueProposalEnrollmentHandoff.ts")
    require((candidate / path).read_bytes() == (core / path).read_bytes() and
            release.inventory.sha((core / path).read_bytes()) == correction["sourceSha256"],
            "Staging handoff source differs")
    release.PLAN["functions"][NAME]["candidateClosureSha256"] = correction["localCandidateClosureSha256"]
    archive = release.package(NAME, Path("application/functions"))
    require(release.digest(release.archive_hashes(archive)) == FILES_SHA,
            "Handoff package file-set hash differs")
    release.check_export(NAME, archive, core / "functions")
    return archive


def token():
    credentials = json.loads(Path(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]).read_text())
    endpoint = f"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{ACCOUNT}:generateAccessToken"
    require(credentials.get("type") == "external_account" and
            credentials.get("service_account_impersonation_url") == endpoint,
            "Unexpected staging credential target")
    return subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()


def configuration(access_token):
    snapshot = release.config(NAME, access_token)
    query = ":getIamPolicy?options.requestedPolicyVersion=3"
    function_url = release.release.endpoint(NAME)
    run_url = "https://run.googleapis.com/v2/" + snapshot["function"]["serviceConfig"]["service"]
    for key, url in (("iam", function_url), ("runIam", run_url)):
        snapshot[key] = json.loads(release.inventory.request(url + query, access_token))
    return snapshot


def run(archive, access_token):
    candidate_files = release.archive_hashes(archive)
    require(release.digest(candidate_files) == FILES_SHA, "Handoff package file-set hash differs")
    release.PROJECT = release.inventory.PROJECT = release.release.PROJECT = PROJECT
    before = configuration(access_token)
    revision = release.verify_function_healthy(NAME, before)
    old_files = release.archive_hashes(release.source(NAME, before, access_token))
    require(old_files != candidate_files, "Candidate already serves staging; no update attempted")
    baseline = release.digest({
        "snapshot": release.inventory.sanitize(before),
        "recoveryFilesSha256": release.digest(old_files),
        "candidateFilesSha256": FILES_SHA,
    })
    require(configuration(access_token) == before, "Staging target drifted during capture")
    print(json.dumps({"project": PROJECT, "function": NAME, "sourceSha": SHA,
                      "beforeRevision": revision, "baselineSha256": baseline,
                      "recoveryFilesSha256": release.digest(old_files),
                      "candidateFilesSha256": FILES_SHA}), flush=True)


if __name__ == "__main__":
    guard(os.environ)
    run(package(), token())
