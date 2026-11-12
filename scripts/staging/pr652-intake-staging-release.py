"""Protected staging source-only update for the existing Intake email callable."""
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

spec = importlib.util.spec_from_file_location(
    "protected_staging", Path(__file__).with_name("pr622-staging-release.py")
)
protected = importlib.util.module_from_spec(spec)
spec.loader.exec_module(protected)
original, release, inventory = protected.original, protected.release, protected.inventory
require = inventory.require
SHA = "3d0b36ea0d1eb2382ec6d0ad76a3c7852b0a1ff8"
BASE = "00e3367730beb2e650662ace36f6f96c73b017c1"
NAME = "sendEnrollmentIntakeEmail"
PREFLIGHT = "pr652-intake-readonly-preflight"
DEPLOY = "pr652-intake-staging-deploy"
APPROVAL = "APPROVE_PR652_STAGING_INTAKE_EMAIL_ONE_FUNCTION"
ROOT = Path("pr614-candidate")
MANIFEST = {
    ".github/workflows/staging-exact-sha-release.yml",
    "scripts/staging/pr652-intake-staging-release.py",
    "functions/src/enrollment/operationalPaidProposal.ts",
    "functions/tests/operationalPaidProposal.test.cjs",
    "functions/src/enrollment/sendEnrollmentIntakeEmail.ts",
    "functions/src/modules/email/resend.ts",
    "tests/functions/emmett-2c-final-blockers.test.mjs",
}


def guard(env):
    require(env.get("REQUESTED_ACTION") in (PREFLIGHT, DEPLOY), "Invalid pr652-intake action")
    for key, expected in {
        "GITHUB_REPOSITORY": inventory.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW,
        "CONFIRM_PROJECT": inventory.PROJECT,
        "CONFIRM_SHA": SHA,
    }.items():
        require(env.get(key) == expected, f"Unexpected {key}")
    if env["REQUESTED_ACTION"] == DEPLOY:
        require(env.get("DEPLOY_APPROVAL") == APPROVAL, "Missing one-function approval")
        require(re.fullmatch(r"[a-f0-9]{64}", env.get("EXPECTED_BASELINE_SHA256", "")),
                "Missing approved rollback baseline SHA-256")


def offline():
    git = protected.git
    require(git(ROOT, "rev-parse", "HEAD") == SHA and git(ROOT, "merge-base", BASE, SHA) == BASE,
            "PR #652 Intake candidate SHA mismatch")
    require(set(git(ROOT, "diff", "--name-only", BASE, SHA).splitlines()) == MANIFEST,
            "PR #652 Intake candidate changed-file scope mismatch")
    require(not git(ROOT, "status", "--porcelain", "--untracked-files=no"), "Candidate checkout modified")


def main():
    guard(os.environ)
    args = sys.argv[1:]
    if args == ["--guard-only"]:
        return
    offline()
    if args == ["--offline"]:
        return
    original.FUNCTIONS = release.FUNCTIONS = {NAME: 1}
    original.ENTRY_POINTS = {NAME: f"lib/enrollment/{NAME}.js"}
    original.SHA, original.guard = SHA, guard
    if args == ["--package"]:
        require(os.environ["REQUESTED_ACTION"] == DEPLOY, "Packaging requires protected deployment")
        original.package()
        return
    require(not args, "Unexpected release arguments")

    token = inventory.command("Acquire staging Function credentials",
                               ["gcloud", "auth", "print-access-token"]).decode().strip()
    before = release.function_config(NAME, token)
    function = before["function"]
    require(function.get("name") ==
            f"projects/{inventory.PROJECT}/locations/us-central1/functions/{NAME}" and
            function.get("entryPoint") == NAME and
            function.get("httpsTrigger", {}).get("url") ==
            f"https://us-central1-{inventory.PROJECT}.cloudfunctions.net/{NAME}",
            "Unexpected staging Intake callable identity or transport")
    environment = function.get("environmentVariables", {})
    require(all(environment.get(key) == inventory.PROJECT for key in
                ("SANDMAN_STAGING_ACK", "SANDMAN_STAGING_PROJECT_ID")),
            "Deployed Intake staging markers are missing or mismatched")
    revision = protected.continuation.expected_revision(NAME, before)
    old_source = original.deployed_source(NAME, before, token)
    inventory.archive_evidence(old_source)
    old_files = release.archive_contents(old_source)
    require(original.ENTRY_POINTS[NAME] in old_files and
            "lib/enrollment/operationalPaidProposal.js" in old_files,
            "Deployed Intake source layout does not match the expected rollback archive")
    evidence = {
        "project": inventory.PROJECT,
        "applicationSha": SHA,
        "function": NAME,
        "rollbackRevision": revision,
        "rollbackSourceSha256": inventory.sha(old_source),
        "runtimeSha256": protected.canonical_sha(original.preserved_runtime_config(before)),
    }
    baseline = protected.canonical_sha(evidence)
    evidence["preflightSha256"] = baseline
    Path("pr652-intake-preflight.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence), flush=True)
    if os.environ["REQUESTED_ACTION"] == PREFLIGHT:
        return
    require(baseline == os.environ["EXPECTED_BASELINE_SHA256"], "Approved pr652-intake baseline drifted")
    candidate = Path(os.environ["CANDIDATE_PACKAGE"]).read_bytes()
    inventory.archive_evidence(candidate)
    candidate_files = release.archive_contents(candidate)
    require("lib/enrollment/operationalPaidProposal.js" in candidate_files and
            candidate_files["lib/enrollment/operationalPaidProposal.js"] !=
            old_files["lib/enrollment/operationalPaidProposal.js"],
            "Candidate does not change the deployed Intake guard")
    require(release.function_config(NAME, token) == before, "Function changed since baseline capture")
    release.source_update(NAME, candidate, token)
    after = release.function_config(NAME, token)
    require(original.preserved_runtime_config(after) == original.preserved_runtime_config(before),
            "Runtime, IAM, or transport changed")
    protected.continuation.verify_deployed_archive(NAME, original.deployed_source(NAME, after, token), candidate)
    new_revision = protected.continuation.expected_revision(NAME, after)
    require(new_revision != revision, "Function revision did not advance")
    Path("pr652-intake-deploy-result.json").write_text(json.dumps({
        **evidence, "verifiedRevision": new_revision,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
