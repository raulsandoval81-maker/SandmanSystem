"""Collect protected staging evidence for the exact historical enrollment candidate."""
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.parse

import receipt_intake_release as release

REPOSITORY = "raulsandoval81-maker/SandmanSystem"
PROJECT = "sandman-combat-staging"
SHA = "3b89bffed91d6e1698503b813f14340c2440f240"
TARGETS = {
    "createProposalDraft": (2, "proposals/createProposalDraft"),
    "sendEnrollmentIntakeEmail": (1, "enrollment/sendEnrollmentIntakeEmail"),
    "recordProposalPrepaidCash": (2, "billing/recordProposalPrepaidCash"),
}
ASSETS = ("/management/pricing/index.html", "/management/pricing/pricing.js",
          "/management/billing/billing.js")
require = release.require


def git(root, *arguments):
    return subprocess.check_output(["git", "-C", str(root), *arguments], text=True).strip()


def guard(env):
    expected = {
        "GITHUB_REPOSITORY": REPOSITORY,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": f"{REPOSITORY}/.github/workflows/staging-exact-sha-release.yml@refs/heads/main",
        "GITHUB_RUN_ATTEMPT": "1",
        "CONFIRM_PROJECT": PROJECT,
        "HISTORICAL_ENROLLMENT_ACTION": "historical-enrollment-preflight",
    }
    for name, value in expected.items():
        require(env.get(name) == value, f"Protected staging preflight guard failed: {name}")


def candidate(root):
    require(git(root, "rev-parse", "HEAD") == SHA, "Unapproved application SHA")
    # This pinned integration SHA contains multiple merged PRs; do NOT assume
    # the last merge commit's diff is the complete release package.
    # Package only these explicit function entrypoints and Hosting paths.
    # No unrelated files are eligible for deployment by this preflight.
    require(subprocess.run(
        ["git", "-C", str(root), "merge-base", "--is-ancestor",
         "58acff9f99ee44a99b979af2169cfb952f9d1c4b", SHA],
        check=False).returncode == 0, "Historical proposal recovery is not in the candidate history")
    for entry in ("billing/recordProposalPrepaidCash", "proposals/createProposalDraft",
                  "enrollment/sendEnrollmentIntakeEmail"):
        require((root / "functions" / "src" / (entry + ".ts")).is_file(),
                "Required approved source entrypoint missing: " + entry)
    require((root / "public/management/billing/billing.js").is_file(),
            "Billing UI is required together with recordProposalPrepaidCash")
    billing_source = (root / "functions/src/billing/recordProposalPrepaidCash.ts").read_text()
    billing_ui = (root / "public/management/billing/billing.js").read_text()
    require("prepaidPaymentEvidenceClaims" in billing_source and
            "paymentEvidenceReference" in billing_source and
            "prepaidCashEvidenceReference" in billing_ui and
            "paymentEvidenceReference," in billing_ui,
            "Candidate is missing the atomic evidence claim / matching Billing UI")
    functions = {}
    for name, (_, entry) in TARGETS.items():
        lib = root / "functions"
        closure = release.inventory.closure(lib, entry)
        release.PLAN["functions"].setdefault(name, {})["candidateClosureSha256"] = release.digest(closure)
        archive = release.package(name, lib)
        release.check_export(name, archive, lib)
        functions[name] = {"fileSetSha256": release.digest(release.archive_hashes(archive)),
                           "closure": closure}
    assets = {}
    for path in ASSETS:
        raw = (root / ("public" + path)).read_bytes()
        gzip = subprocess.run(
            ["node", "-e", "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0)))"],
            input=raw, capture_output=True, check=True,
        ).stdout
        assets[path] = {"sourceSha256": release.inventory.sha(raw),
                        "hostingHash": release.inventory.sha(gzip)}
    return {"functions": functions, "hostingAssets": assets,
            "exactSourceSha": SHA, "paymentEvidenceClaimGate": "source-verified"}


def set_staging_scope():
    # Cloud Functions uses the project ID; Hosting APIs require the full
    # sites/<site-id> resource. Do not conflate them: doing so yields HTTP 404
    # when retrieving the active staging release.
    hosting_site = f"sites/{PROJECT}"
    release.PROJECT = PROJECT
    release.SITE = hosting_site
    release.inventory.PROJECT = PROJECT
    release.inventory.SITE = hosting_site
    release.inventory.NUMBER = "991554514268"
    release.release.PROJECT = PROJECT
    release.release.SITE = hosting_site
    release.inventory.FUNCTIONS = dict(TARGETS)
    release.release.FUNCTIONS = {name: generation for name, (generation, _) in TARGETS.items()}


def function_baseline(name, token):
    def snapshot():
        state = release.config(name, token)
        suffix = ":getIamPolicy?options.requestedPolicyVersion=3"
        state["iam"] = release.get(release.release.endpoint(name) + suffix, token)
        if "run" in state:
            state["runIam"] = release.get("https://run.googleapis.com/v2/" + state["run"]["name"] +
                                          suffix, token)
        return state

    before = snapshot()
    serving = release.verify_function_healthy(name, before)
    function = before["function"]
    if TARGETS[name][0] == 2:
        storage = function.get("buildConfig", {}).get("sourceProvenance", {}).get("resolvedStorageSource")
        require(isinstance(storage, dict) and all(storage.get(key) for key in
                ("bucket", "object", "generation")), f"{name}: immutable source generation unavailable")
        object_name = urllib.parse.quote(storage["object"], safe="")
        query = urllib.parse.urlencode({"alt": "media", "generation": storage["generation"]})
        archive = release.inventory.request(
            f"https://storage.googleapis.com/storage/v1/b/{storage['bucket']}/o/{object_name}?{query}",
            token,
        )
    else:
        storage = {"versionId": serving}
        archive = release.source(name, before, token, serving)
    hashes = release.archive_hashes(archive)
    require(bool(hashes), f"{name}: rollback archive is empty")
    require(snapshot() == before, f"{name}: baseline drift during rollback capture")
    config = function.get("serviceConfig", function)
    build = function.get("buildConfig", function)
    return {"servingVersionOrRevision": serving, "sourceReference": storage,
            "rollbackFilesSha256": release.digest(hashes),
            "rollbackArchiveSha256": release.inventory.sha(archive),
            "configurationSha256": release.digest(before),
            "functionIamSha256": release.digest(before["iam"]),
            "runIamSha256": release.digest(before["runIam"]) if "runIam" in before else None,
            "runtime": {key: config.get(key) for key in (
                "serviceAccountEmail", "availableMemory", "availableMemoryMb", "availableCpu",
                "timeoutSeconds", "timeout", "minInstanceCount", "maxInstanceCount",
                "minInstances", "maxInstances", "maxInstanceRequestConcurrency",
                "ingressSettings", "vpcConnector", "vpcConnectorEgressSettings")},
            "languageRuntime": build.get("runtime"),
            "entryPoint": build.get("entryPoint"),
            "secretReferences": config.get("secretEnvironmentVariables", []),
            "secretVolumes": config.get("secretVolumes", []),
            "rollbackRehearsed": False}


def hosting_baseline(token, candidate_assets):
    active = release.active(token)
    for value, collection in zip(active, ("releases", "versions")):
        require(re.fullmatch(rf"sites/{PROJECT}/{collection}/[\w-]+", value),
                "Staging Hosting release or version identity is invalid")
    version = release.get(release.HOSTING + active[1], token)
    require(version.get("status") == "FINALIZED" and isinstance(version.get("config"), dict),
            "Staging Hosting rollback version or configuration unavailable")
    files = release.inventory.manifest(lambda url: release.get(url, token), active[1])
    for path in (*ASSETS, "/staging-environment.json", "/assets/js/runtime-environment.js"):
        require(path in files, f"Missing baseline Hosting asset: {path}")
    require(release.active(token) == active, "Staging Hosting baseline drift during capture")
    proposed = {**files, **{path: asset["hostingHash"] for path, asset in candidate_assets.items()}}
    return {"release": active[0], "version": active[1], "fileCount": len(files),
            "configurationSha256": release.digest(version["config"]),
            "manifestSha256": release.digest(files), "overlayManifestSha256": release.digest(proposed),
            "changedPaths": [path for path in ASSETS if proposed[path] != files[path]],
            "rollbackRehearsed": False}


def main():
    guard(os.environ)
    set_staging_scope()
    output = Path("evidence/historical-enrollment")
    output.mkdir(parents=True, exist_ok=True)
    report = {"project": PROJECT, "sourceSha": SHA, "deploymentAuthorized": False,
              "functions": {}, "blockers": []}
    try:
        report["candidate"] = candidate(Path("application"))
        token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
        require(bool(token), "Staging access token unavailable")
        for name in TARGETS:
            try:
                report["functions"][name] = function_baseline(name, token)
            except RuntimeError as error:
                report["blockers"].append(f"{name}: {error}")
        try:
            report["hosting"] = hosting_baseline(token, report["candidate"]["hostingAssets"])
        except RuntimeError as error:
            report["blockers"].append(f"Hosting: {error}")
        require(not report["blockers"], "Live staging baseline incomplete")
    finally:
        (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
