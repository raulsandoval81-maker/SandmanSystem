"""One-shot guarded historical enrollment staging release, not production.

Source-only updates of three callable Functions and a three-file Hosting overlay.
A first uncertain write permanently stops this run: STOP_NO_RETRY.
"""
import importlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse

preflight = importlib.import_module("historical-enrollment-preflight")
release = preflight.release
require = release.require
inventory = release.inventory

PROJECT = "sandman-combat-staging"
SHA = "3b89bffed91d6e1698503b813f14340c2440f240"
PREFLIGHT_RUN = "44856250072"
APPROVAL = "APPROVE_HISTORICAL_ENROLLMENT_STAGING_THREE_FUNCTIONS_THREE_FILES"
ACTION = "historical-enrollment-guarded-deploy"
REPORT = Path("evidence/historical-enrollment/guarded-deploy.json")
FUNCTION_ORDER = (
    "createProposalDraft",
    "sendEnrollmentIntakeEmail",
    "recordProposalPrepaidCash",
)
# Anchored to the successful staging preflight run 44856250072.
BASELINES = {
    "createProposalDraft": {
        "servingVersionOrRevision": "createproposaldraft-00009-haz",
        "configurationSha256": "4f3cd8e801e3fa448f641f0aa6fc66791a479a4e4dddcede233069f06a1646e2",
        "rollbackArchiveSha256": "cc26e3c1e66ea7aa1c84c31b5941db435203ff8f676c421b434b8eb5fae1205f",
        "functionIamSha256": "de8e97540ca3499319bd4571ad89c465fd68328a4c4f26d143ca6f58d31816ac",
        "runIamSha256": "de8e97540ca3499319bd4571ad89c465fd68328a4c4f26d143ca6f58d31816ac",
        "fileSetSha256": "c7803405b1ba7f5ac2e8c88e3597c7a2629aae5070b462056c443c40a48302d3",
    },
    "sendEnrollmentIntakeEmail": {
        "servingVersionOrRevision": "9",
        "configurationSha256": "b130a46bc2f7031975695c06d3f7d2e17afb6c11cb4653ac9655a68fc1a58d86",
        "rollbackArchiveSha256": "1aace0ade7c82a40a49077c9eff19960f7403c9e8ffc84aa7d541083f02c3193",
        "functionIamSha256": "4973eab70dcae5b0c6c3413ac22386d343e8d71ac904d612b4dacc09875a146d",
        "runIamSha256": None,
        "fileSetSha256": "9c9f9de9515fa33948d6f3ecafeaaa7b7dd33b109af643f139eec43077dd7daf",
    },
    "recordProposalPrepaidCash": {
        "servingVersionOrRevision": "recordproposalprepaidcash-00013-nup",
        "configurationSha256": "3deed310e03b8e45483405884e2c1d324ef9fe4067a658fb38806fa146654a53",
        "rollbackArchiveSha256": "39f574943e5b9eeb844c8aa93c247fd7a58d823ed74f5a506d38a41989da0e41",
        "functionIamSha256": "de8e97540ca3499319bd4571ad89c465fd68328a4c4f26d143ca6f58d31816ac",
        "runIamSha256": "de8e97540ca3499319bd4571ad89c465fd68328a4c4f26d143ca6f58d31816ac",
        "fileSetSha256": "4f14dddf3bb4ce227990b9a7cf6a26a40de888fecef7898d480d03777fcc2cb6",
    },
}
HOSTING = {
    "release": "sites/sandman-combat-staging/releases/1795093032152000",
    "version": "sites/sandman-combat-staging/versions/fdcf708f150245f5",
    "fileCount": 3073,
    "configurationSha256": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    "manifestSha256": "d0b06c7a0c5d1248e98ae408f685d4d79fd6e98130709c67489296bf0a7a72a9",
    "overlayManifestSha256": "6ec9d50bb969ba3c04a0219b30a33342b581247f42c53b965f118d8955ac5d74",
}


def guard(env):
    # Dedicated protected staging workflow: reject legacy dispatch identity.
    expected = {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF":
            "raulsandoval81-maker/SandmanSystem/.github/workflows/"
            "historical-enrollment-staging-deploy.yml@refs/heads/main",
        "GITHUB_RUN_ATTEMPT": "1",
        "CONFIRM_PROJECT": PROJECT,
    }
    for key, value in expected.items():
        require(env.get(key) == value, "Guarded staging deployment boundary: " + key)
    require(env.get("HISTORICAL_ENROLLMENT_ACTION") == ACTION,
            "Guarded deployment action required")
    require(env.get("DEPLOY_APPROVAL") == APPROVAL,
            "Missing exact three-Function/three-file staging approval")
    require(env.get("CONFIRM_SOURCE_SHA") == SHA, "Unexpected approved source")
    require(env.get("CONFIRM_PREFLIGHT_RUN") == PREFLIGHT_RUN,
            "Approved read-only preflight evidence mismatch")
    require(env.get("GITHUB_RUN_ATTEMPT") == "1", "STOP_NO_RETRY: reruns prohibited")


def active_hosting(token):
    active = release.active(token)
    require(active == (HOSTING["release"], HOSTING["version"]),
            "Hosting release changed since approved preflight")
    version = release.get(release.HOSTING + active[1], token)
    require(version.get("status") == "FINALIZED" and
            release.digest(version.get("config")) == HOSTING["configurationSha256"],
            "Hosting configuration changed since preflight")
    manifest = inventory.manifest(lambda url: release.get(url, token), active[1])
    require(len(manifest) == HOSTING["fileCount"] and
            release.digest(manifest) == HOSTING["manifestSha256"],
            "Hosting manifest changed since preflight")
    return version["config"], manifest


def validate_live_baselines(function_token, hosting_token, candidate):
    before = {}
    for name in FUNCTION_ORDER:
        record = preflight.function_baseline(name, function_token)
        for key in ("servingVersionOrRevision", "configurationSha256",
                    "rollbackArchiveSha256", "functionIamSha256", "runIamSha256"):
            require(record.get(key) == BASELINES[name][key],
                    name + ": immutable Function/Run/IAM or rollback source drift: " + key)
        require(candidate["functions"][name]["fileSetSha256"] ==
                BASELINES[name]["fileSetSha256"],
                name + ": compiled source package differs from approved preflight")
        before[name] = release.config(name, function_token)
        require(release.digest(before[name]) == BASELINES[name]["configurationSha256"],
                name + ": live snapshot drift after recovery capture")
    config, manifest = active_hosting(hosting_token)
    expected = {**manifest, **{
        path: candidate["hostingAssets"][path]["hostingHash"] for path in preflight.ASSETS
    }}
    require(release.digest(expected) == HOSTING["overlayManifestSha256"],
            "Hosting candidate changed since approved preflight")
    require(set(expected).difference(manifest) == set(),
            "Unapproved Hosting file additions")
    require(set(path for path in expected if expected[path] != manifest[path]) ==
            set(preflight.ASSETS), "Hosting changed-file scope differs")
    return before, config, manifest, expected


def verify_function_after(name, before, candidate_archive, token):
    after = release.config(name, token)
    revision = release.verify_function_healthy(name, after)
    require(revision != BASELINES[name]["servingVersionOrRevision"],
            name + ": source deployment did not advance revision/version")
    release.verify_updated_runtime(name, before, after)
    delivered = release.source(name, after, token, revision if preflight.TARGETS[name][0] == 1 else None)
    require(release.archive_hashes(delivered) == release.archive_hashes(candidate_archive),
            name + ": source archive differs from approved candidate")
    return revision


def hosting_payloads(root, candidate):
    result = {}
    for path in preflight.ASSETS:
        raw = (root / ("public" + path)).read_bytes()
        zipped = subprocess.run(
            ["node", "-e",
             "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0)))"],
            input=raw, capture_output=True, check=True).stdout
        require(inventory.sha(raw) == candidate["hostingAssets"][path]["sourceSha256"] and
                inventory.sha(zipped) == candidate["hostingAssets"][path]["hostingHash"],
                "Hosting source or compressed upload digest mismatch: " + path)
        result[candidate["hostingAssets"][path]["hostingHash"]] = zipped
    return result


def guarded_release():
    guard(os.environ)
    preflight.set_staging_scope()
    require(set(preflight.TARGETS) == set(FUNCTION_ORDER) and
            set(preflight.ASSETS) == {
                "/management/pricing/index.html",
                "/management/pricing/pricing.js",
                "/management/billing/billing.js"},
            "Unexpected staging release function/Hosting scope")
    root = Path("application")
    candidate = preflight.candidate(root)
    function_token = subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True).strip()
    require(bool(function_token), "Staging Function token unavailable")
    hosting_token = preflight.authorized_hosting_token(os.environ)
    # No mutations until ALL Function, Hosting, rollback and package pins match.
    before, config, manifest, expected = validate_live_baselines(
        function_token, hosting_token, candidate)
    archives = {}
    for name in FUNCTION_ORDER:
        archive = release.package(name, root / "functions")
        require(release.digest(release.archive_hashes(archive)) ==
                BASELINES[name]["fileSetSha256"],
                name + ": rebuilt source package hash mismatch")
        archives[name] = archive
    payloads = hosting_payloads(root, candidate)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    progress = {
        "project": PROJECT, "approvedSourceSha": SHA,
        "preflightRun": PREFLIGHT_RUN,
        "approvedHostingVersion": HOSTING["version"],
        "attemptedFunctions": [], "verifiedRevisions": {},
        "preparedHostingVersion": None, "publishedHostingRelease": None,
        "stopNoRetry": True, "status": "PREFLIGHT_VERIFIED",
        "productionTouched": False,
    }

    def save():
        REPORT.write_text(json.dumps(progress, indent=2, sort_keys=True) + "\n")

    save()
    # A prepared Hosting version is not published and does not affect live UI.
    # From this point on any exception is a STOP_NO_RETRY, not a retry request.
    try:
        progress["status"] = "STAGING_HOSTING_PREPARATION_STARTED"
        save()
        version = release.prepare_hosting(config, manifest, payloads, hosting_token)
        progress["preparedHostingVersion"] = version
        release.release.verify_version(version, config, expected, hosting_token)
        save()
        for name in FUNCTION_ORDER:
            require(release.config(name, function_token) == before[name],
                    name + ": live baseline changed before source write")
            active_hosting(hosting_token)
            progress["attemptedFunctions"].append(name)
            progress["status"] = "FUNCTION_SOURCE_UPDATE_ATTEMPTED"
            save()
            release.release.source_update(name, archives[name], function_token)
            revision = verify_function_after(name, before[name], archives[name], function_token)
            progress["verifiedRevisions"][name] = revision
            progress["status"] = "FUNCTION_SOURCE_VERIFIED"
            save()
        # No partially served new UI until all three callable source updates pass.
        active_hosting(hosting_token)
        release.release.verify_version(version, config, expected, hosting_token)
        progress["status"] = "HOSTING_PUBLICATION_ATTEMPTED"
        save()
        query = urllib.parse.urlencode({"versionName": version})
        receipt = release.release.write(
            "Publish guarded historical staging Hosting overlay",
            release.HOSTING + preflight.release.SITE + "/releases?" + query,
            "POST", {}, hosting_token)
        progress["publishedHostingRelease"] = receipt.get("name")
        require(release.active(hosting_token) == (receipt.get("name"), version),
                "Published Hosting release not active")
        release.release.verify_version(version, config, expected, hosting_token)
        progress["status"] = "STAGING_PUBLISHED_VERIFIED"
        save()
    except Exception as error:
        progress["status"] = "STOP_NO_RETRY"
        progress["failureType"] = type(error).__name__
        save()
        # No raw error text: service metadata and signed URLs stay out of CI.
        print(json.dumps({"STOP_NO_RETRY": True,
                          "attemptedFunctions": progress["attemptedFunctions"],
                          "verifiedRevisions": progress["verifiedRevisions"],
                          "preparedHostingVersion": progress["preparedHostingVersion"],
                          "hostingPublished": bool(progress["publishedHostingRelease"])}),
              flush=True)
        raise SystemExit(1) from None
    print(json.dumps({"status": progress["status"], "project": PROJECT,
                      "functionsVerified": list(progress["verifiedRevisions"]),
                      "hostingVersion": version}), flush=True)


if __name__ == "__main__":
    require(sys.argv[1:] in ([], ["--guard-only"]), "Unexpected release mode")
    if sys.argv[1:] == ["--guard-only"]:
        guard(os.environ)
    else:
        guarded_release()
