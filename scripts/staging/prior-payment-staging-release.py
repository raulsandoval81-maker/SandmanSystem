"""Protected staging source-only update for the existing prior-payment callable."""
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
SHA = "5b0b628f57e09b217af26a69efcd4c0579b03335"
BASE = "d5e0a613a3ae8e7642b49e2231bf2fcfab03f34c"
NAME = "recordProposalPriorPayment"
PREFLIGHT = "prior-payment-readonly-preflight"
DEPLOY = "prior-payment-staging-deploy"
APPROVAL = "APPROVE_PRIOR_PAYMENT_STAGING_ONE_FUNCTION"
ROOT = Path("pr614-candidate")
MANIFEST = {
    f"functions/src/billing/{NAME}.ts",
    f"functions/tests/{NAME}Startup.test.cjs",
}


def guard(env):
    require(env.get("REQUESTED_ACTION") in (PREFLIGHT, DEPLOY), "Invalid prior-payment action")
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
    require(git(ROOT, "rev-parse", "HEAD") == SHA and git(ROOT, "rev-parse", "HEAD^") == BASE,
            "Prior-payment candidate SHA mismatch")
    require(set(git(ROOT, "diff", "--name-only", BASE, SHA).splitlines()) == MANIFEST,
            "Prior-payment candidate changed-file scope mismatch")
    require(not git(ROOT, "status", "--porcelain", "--untracked-files=no"), "Candidate checkout modified")


def main():
    guard(os.environ)
    args = sys.argv[1:]
    if args == ["--guard-only"]:
        return
    offline()
    if args == ["--offline"]:
        return
    original.FUNCTIONS = release.FUNCTIONS = {NAME: 2}
    original.ENTRY_POINTS = {NAME: f"lib/billing/{NAME}.js"}
    original.SHA, original.guard = SHA, guard
    if args == ["--package"]:
        require(os.environ["REQUESTED_ACTION"] == DEPLOY, "Packaging requires protected deployment")
        original.package()
        return
    require(not args, "Unexpected release arguments")

    token = inventory.command("Acquire staging Function credentials",
                               ["gcloud", "auth", "print-access-token"]).decode().strip()
    before = release.function_config(NAME, token)
    revision = protected.continuation.expected_revision(NAME, before)
    old_source = original.deployed_source(NAME, before, token)
    inventory.archive_evidence(old_source)
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
    Path("prior-payment-preflight.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps(evidence), flush=True)
    if os.environ["REQUESTED_ACTION"] == PREFLIGHT:
        return
    require(baseline == os.environ["EXPECTED_BASELINE_SHA256"], "Approved prior-payment baseline drifted")
    candidate = Path(os.environ["CANDIDATE_PACKAGE"]).read_bytes()
    inventory.archive_evidence(candidate)
    require(release.function_config(NAME, token) == before, "Function changed since baseline capture")
    release.source_update(NAME, candidate, token)
    after = release.function_config(NAME, token)
    require(original.preserved_runtime_config(after) == original.preserved_runtime_config(before),
            "Runtime, IAM, or transport changed")
    protected.continuation.verify_deployed_archive(NAME, original.deployed_source(NAME, after, token), candidate)
    new_revision = protected.continuation.expected_revision(NAME, after)
    require(new_revision != revision, "Function revision did not advance")
    Path("prior-payment-deploy-result.json").write_text(json.dumps({
        **evidence, "verifiedRevision": new_revision,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
