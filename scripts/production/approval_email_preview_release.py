"""Release the approval preview through the protected production environment."""
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.parse
import zipfile

import receipt_intake_release as release

SHA = "efee171424d2e3dc815a4aca27fa38507f8298e5"
NAME = "issueProposalEnrollmentHandoff"
ENTRY = "lib/proposals/issueProposalEnrollmentHandoff.js"
ROOT = Path("application")
EVIDENCE = Path("release-evidence")


def snapshot(token):
    state = release.config(NAME, token)
    suffix = ":getIamPolicy?options.requestedPolicyVersion=3"
    state["iam"] = release.get(release.release.endpoint(NAME) + suffix, token)
    state["runIam"] = release.get("https://run.googleapis.com/v2/" + state["run"]["name"] + suffix, token)
    return state


def source(state, token):
    config = state["function"]["buildConfig"]
    ref = config["sourceProvenance"]["resolvedStorageSource"]
    release.require(str(ref["generation"]).isdigit(), "Missing immutable rollback generation")
    path = urllib.parse.quote(ref["object"], safe="")
    url = f"https://storage.googleapis.com/storage/v1/b/{ref['bucket']}/o/{path}"
    return release.inventory.request(url + "?" + urllib.parse.urlencode(
        {"alt": "media", "generation": ref["generation"]}), token)


def overlay(archive, original, replacement):
    old = release.archive_hashes(archive)
    with zipfile.ZipFile(io.BytesIO(archive)) as current:
        release.require(ENTRY in old and current.read(ENTRY) == original,
                        "Serving handoff differs from the reviewed pre-preview source")
        result = io.BytesIO()
        with zipfile.ZipFile(result, "w", zipfile.ZIP_DEFLATED) as new:
            for path in old:
                new.writestr(path, replacement if path == ENTRY else current.read(path))
    updated = result.getvalue()
    expected = {**old, ENTRY: release.inventory.sha(replacement)}
    release.require(release.archive_hashes(updated) == expected, "Candidate archive scope differs")
    return updated


def evidence(name, values):
    EVIDENCE.mkdir(exist_ok=True)
    (EVIDENCE / name).write_text(json.dumps(values, indent=2) + "\n")
    print(json.dumps(values), flush=True)


def main():
    mode = os.environ["RELEASE_MODE"]
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    before = snapshot(token)
    revision = release.verify_function_healthy(NAME, before)
    archive = source(before, token)
    candidate = (ROOT / "functions" / ENTRY).read_bytes()
    live_files = release.archive_hashes(archive)
    candidate_hash = release.inventory.sha(candidate)
    if mode.startswith("hosting-"):
        release.require(live_files.get(ENTRY) == candidate_hash,
                        "The reviewed email-note backend must be serving before Hosting")
        import emmett_enrollment_hosting_release as hosting
        hosting.SOURCE_SHA = SHA
        hosting.FILES = ("public/connect/proposals/proposals.js",)
        sys.argv = [sys.argv[0], "--mode", mode.removeprefix("hosting-"),
                    "--source-root", str(ROOT), "--evidence-dir", str(EVIDENCE),
                    "--confirm-project", release.PROJECT, "--confirm-source-sha", SHA,
                    "--expected-release", os.environ.get("EXPECTED_RELEASE", ""),
                    "--expected-version", os.environ.get("EXPECTED_VERSION", "")]
        return hosting.main()
    if live_files.get(ENTRY) == candidate_hash:
        evidence("function-already-serving.json", {"revision": revision, "sourceSha": SHA,
                                                  "entrySha256": candidate_hash})
        return
    original = (Path("baseline-source") / "functions" / ENTRY).read_bytes()
    package = overlay(archive, original, candidate)
    rollback_ref = before["function"]["buildConfig"]["sourceProvenance"]["resolvedStorageSource"]
    baseline = release.digest({"snapshot": before, "rollbackFiles": live_files,
                               "candidateFiles": release.archive_hashes(package)})
    report = {"revision": revision, "sourceSha": SHA, "baselineSha256": baseline,
              "rollbackReference": rollback_ref, "rollbackArchiveSha256": release.inventory.sha(archive),
              "candidateFilesSha256": release.digest(release.archive_hashes(package))}
    release.require(snapshot(token) == before, "Production baseline drifted during preflight")
    evidence("function-before.json", report)
    if mode == "function-preflight":
        return
    release.require(mode == "function-deploy" and baseline == os.environ.get("EXPECTED_FUNCTION_BASELINE"),
                    "Production baseline differs from approved preflight")
    evidence("function-attempt.json", {"STOP_NO_RETRY": True, **report})
    release.release.source_update(NAME, package, token)
    after = snapshot(token)
    serving = release.verify_function_healthy(NAME, after)
    release.require(serving != revision, "Expected a new serving revision")
    release.verify_updated_runtime(NAME, before, after)
    release.require(release.archive_hashes(source(after, token)) == release.archive_hashes(package),
                    "Serving source differs from reviewed package")
    release.require(release.archive_hashes(source(before, token)) == live_files,
                    "Rollback source is no longer readable")
    evidence("function-after.json", {"servingRevision": serving, "runtimeIamSecretsParity": True,
                                    "rollbackReadable": True, **report})


if __name__ == "__main__":
    main()
