"""Pinned PR #614 staging release inventory. No deployment API is called."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote

inventory = __import__("pr606-readonly-preflight")
PROJECT = inventory.PROJECT
SHA = "334e98de3a443c19d9f45722bda45a1ff92fb336"
BASE = "e7c0bd7b912c91f91f5acd61d14d17723c7ce0d2"
ACTION = "pr614-readonly-preflight"
ROOT = Path("pr614-candidate")
FUNCTIONS = {
    "approveAndActivate": (2, "approveAndActivate"),
    "sendProposalPrepaidCashReceipt": (2, "billing/sendProposalPrepaidCashReceipt"),
    "sendEnrollmentIntakeEmail": (1, "enrollment/sendEnrollmentIntakeEmail"),
    "hydrateEnrollmentIntakePrefill": (2, "enrollment/hydrateEnrollmentIntakePrefill"),
    "approveIntakeCall": (2, "modules/approveIntakeCall"),
    "acceptProposalClientReview": (2, "proposals/acceptProposalClientReview"),
    "issueProposalEnrollmentHandoff": (2, "proposals/issueProposalEnrollmentHandoff"),
    "saveProposalEnrollmentAgreement": (2, "proposals/saveProposalEnrollmentAgreement"),
}
ASSETS = (
    "/connect/proposals/review/review.js",
    "/connect/enrollment/enrollment.js",
    "/connect/enrollment/enrollment.service.js",
    "/intake-management/management.intake.js",
)
SUPPORT = {
    "functions/src/modules/createAthleteFromIntakeCall.ts",
    "functions/src/enrollment/combinedEnrollmentReceipt.ts",
    "functions/src/enrollment/earlyCashCheckIntake.ts",
    "functions/src/enrollment/requireVerifiedCashCheckIntakePayment.ts",
    "functions/tests/cashCheckIntakePayment.test.cjs",
    "functions/tests/combinedEnrollmentReceipt.test.cjs",
    "functions/tests/earlyCashCheckIntake.test.cjs",
    "tests/browser/cash-check-enrollment-polish.test.mjs",
    "tests/firestore/intake.rules.test.mjs",
}
MARKED = {
    "acceptProposalClientReview", "issueProposalEnrollmentHandoff",
    "saveProposalEnrollmentAgreement", "hydrateEnrollmentIntakePrefill",
}
REQUIREMENTS = {
    "functions": ["cloudfunctions.functions.get", "cloudfunctions.functions.update",
                  "cloudfunctions.functions.sourceCodeGet", "cloudfunctions.functions.sourceCodeSet",
                  "run.services.get", "run.services.getIamPolicy", "run.revisions.get"],
    "hosting": ["firebasehosting.sites.get", "firebasehosting.sites.update"],
    "rules": ["firebaserules.releases.get", "firebaserules.releases.update",
              "firebaserules.rulesets.get", "firebaserules.rulesets.create"],
}


def candidate_bytes(path):
    return subprocess.check_output(["git", "-C", str(ROOT), "show", f"{SHA}:{path}"])


def offline():
    def git(*args):
        return subprocess.check_output(["git", "-C", str(ROOT), *args], text=True).strip()
    inventory.require(git("rev-parse", "HEAD") == SHA, "Incorrect application SHA")
    paths = {f"functions/src/{path}.ts" for _, path in FUNCTIONS.values()}
    paths.update({"firestore.rules", *("public" + path for path in ASSETS)})
    changed = set(git("diff", "--name-only", BASE, SHA).splitlines())
    expected = (paths | SUPPORT) - {"functions/src/enrollment/sendEnrollmentIntakeEmail.ts"}
    inventory.require(changed == expected, f"Release diff mismatch: {sorted(changed ^ expected)}")
    inventory.require(not git("status", "--porcelain", "--untracked-files=no"), "Application checkout has local changes")
    return {path: inventory.sha(candidate_bytes(path)) for path in sorted(paths | SUPPORT)}


def get(label, url, token):
    return json.loads(inventory.read(label, url, token))


def permission_probe(label, resource, token, required):
    request = urllib.request.Request(resource + ":testIamPermissions",
        data=json.dumps({"permissions": required}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.build_opener(inventory.NoRedirect()).open(request, timeout=30) as response:
            granted = json.load(response).get("permissions", [])
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{label}: HTTP {exc.code}") from None
    return {"required": required, "granted": sorted(granted), "missing": sorted(set(required) - set(granted))}


def live():
    for key, expected in {
        "GITHUB_REPOSITORY": inventory.REPO, "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW, "CONFIRM_PROJECT": PROJECT,
        "CONFIRM_SHA": SHA, "REQUESTED_ACTION": ACTION,
    }.items():
        inventory.require(os.environ.get(key) == expected, f"Unexpected {key}")
    result = {"project": PROJECT, "applicationSha": SHA, "candidateHashes": offline(),
              "functions": {}, "errors": []}

    def capture(label, operation):
        try:
            return operation()
        except (RuntimeError, KeyError, ValueError, OSError, subprocess.SubprocessError) as exc:
            result["errors"].append({"check": label, "error": str(exc) if isinstance(exc, RuntimeError)
                                     else type(exc).__name__})
            return None

    token = inventory.command("Acquire staging Function credentials", ["gcloud", "auth", "print-access-token"]).decode().strip()
    host_token = inventory.hosting_access_token(os.environ)
    project_url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}"
    project = capture("Firebase project", lambda: get("Firebase project", f"https://firebase.googleapis.com/v1beta1/projects/{PROJECT}", host_token))
    if not project or project.get("projectId") != PROJECT or str(project.get("projectNumber")) != inventory.PROJECT_NUMBER:
        result["errors"].append({"check": "Firebase project", "error": "Staging project ID/number not verified"})
    result["permissionProbes"] = {}
    for surface, requirements in REQUIREMENTS.items():
        principal = "sandman-staging-deployer" if surface in {"hosting", "rules"} else "sandman-practice-deployer"
        evidence = capture(surface + " project IAM", lambda: permission_probe(
            surface, project_url, host_token if surface in {"hosting", "rules"} else token, requirements))
        result["permissionProbes"][surface] = {"principal": f"{principal}@{PROJECT}.iam.gserviceaccount.com",
                                               "evidence": evidence}
        if evidence and evidence["missing"]:
            result["errors"].append({"check": surface, "missing": evidence["missing"]})

    for name, (generation, _) in FUNCTIONS.items():
        def describe():
            url = f"https://cloudfunctions.googleapis.com/v{generation}/projects/{PROJECT}/locations/us-central1/functions/{name}"
            record = get(name, url, token)
            runtime = record if generation == 1 else record["serviceConfig"]
            identity = runtime["serviceAccountEmail"]
            inventory.require(identity.endswith(f"@{PROJECT}.iam.gserviceaccount.com") or
                              identity in {f"{PROJECT}@appspot.gserviceaccount.com",
                                           f"{inventory.PROJECT_NUMBER}-compute@developer.gserviceaccount.com"},
                              f"{name}: runtime identity is outside staging")
            inventory.require(record.get("status" if generation == 1 else "state") == "ACTIVE",
                              f"{name}: not ACTIVE")
            markers = {key: runtime.get("environmentVariables", {}).get(key) == PROJECT
                       for key in ("SANDMAN_STAGING_ACK", "SANDMAN_STAGING_PROJECT_ID")}
            entry = {"generation": generation, "runtimeIdentity": identity, "markers": markers,
                     "configuration": inventory.redact(record), "iam": get(name + " IAM", url + ":getIamPolicy", token)}
            result["functions"][name] = entry
            if name in MARKED and not all(markers.values()):
                result["errors"].append({"check": name, "error": "Missing or incorrect staging runtime markers",
                                         "markers": markers})
            if generation == 2:
                service = runtime["service"]
                inventory.require(service == f"projects/{PROJECT}/locations/us-central1/services/{name.lower()}",
                                  "Unexpected Cloud Run service")
                run = "https://run.googleapis.com/v2/" + service
                cloud_run = get(name + " Cloud Run", run, token)
                entry["run"] = inventory.redact(cloud_run)
                entry["runIam"] = get(name + " Cloud Run IAM", run + ":getIamPolicy", token)
                revision = cloud_run["latestReadyRevision"]
                inventory.require(re.fullmatch(re.escape(service) + r"/revisions/[a-z0-9-]+", revision),
                                  "Invalid rollback revision reference")
                entry["rollbackRevision"] = get(name + " rollback revision", "https://run.googleapis.com/v2/" + revision, token)["name"]
            if generation == 1 or name == "sendProposalPrepaidCashReceipt":
                archive, reference = inventory.source_archive(name, generation, record, token)
            else:
                storage = record["buildConfig"]["sourceProvenance"]["resolvedStorageSource"]
                bucket, obj, version = storage["bucket"], storage["object"], str(storage["generation"])
                inventory.require(bucket == f"gcf-v2-sources-{inventory.PROJECT_NUMBER}-us-central1"
                                  and obj == f"{name}/function-source.zip" and version.isdigit(),
                                  f"{name}: immutable staging source reference missing")
                reference = {"bucket": bucket, "object": obj, "generation": version}
                label = name + " rollback source"
                try:
                    archive = inventory.read(label,
                        f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/{quote(obj, safe='')}?alt=media&generation={version}", token)
                except RuntimeError as exc:
                    if str(exc) != f"{label}: HTTP 403":
                        raise
                    entry["directRollbackRead"] = {"status": 403, **reference}
                    archive = inventory.signed_source(name, "v2alpha", {}, token,
                        gen2_functions=tuple(key for key, (gen, _) in FUNCTIONS.items() if gen == 2))
                    reference["retrievedVia"] = "v2alpha.generateDownloadUrl"

            entry["rollbackSource"] = {**inventory.archive_evidence(archive), "reference": reference}
            entry["actAs"] = permission_probe(name + " runtime actAs",
                f"https://iam.googleapis.com/v1/projects/{PROJECT}/serviceAccounts/{identity}", token,
                ["iam.serviceAccounts.actAs"])
            if entry["actAs"]["missing"]:
                result["errors"].append({"check": name, "missing": entry["actAs"]["missing"]})
            inventory.require(get(name + " recheck", url, token) == record, f"{name}: baseline changed during preflight")
            return entry
        capture(name, describe)

    def rules():
        base = "https://firebaserules.googleapis.com/v1/"
        release = get("Firestore active release", base + f"projects/{PROJECT}/releases/cloud.firestore", host_token)
        ruleset = release["rulesetName"]
        inventory.require(re.fullmatch(rf"projects/{PROJECT}/rulesets/[a-zA-Z0-9-]+", ruleset),
                          "Unexpected Firestore ruleset reference")
        source = get("Firestore rollback source", base + ruleset, host_token)["source"]["files"]
        inventory.require(len(source) == 1 and source[0]["name"] == "firestore.rules", "Unexpected active Rules scope")
        return {"release": release["name"], "ruleset": ruleset,
                "sha256": inventory.sha(source[0]["content"].encode())}

    def hosting():
        candidate = candidate_bytes("public" + inventory.TARGET)
        baseline = inventory.hosting(lambda label, url: get(label, url, host_token), candidate)
        proposed = dict(baseline["manifest"])
        for path in ASSETS:
            data = candidate_bytes("public" + path)
            zipped = subprocess.run(["node", "-e",
                "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0),{mtime:0}))"],
                input=data, capture_output=True, check=True, timeout=15).stdout
            proposed[path] = inventory.sha(zipped)
        changed = {path for path, digest in proposed.items() if baseline["manifest"].get(path) != digest}
        inventory.require(set(proposed) == set(baseline["manifest"]) and changed == set(ASSETS),
                          f"Unexpected Hosting overlay: {sorted(changed)}")
        return {**baseline, "candidateSha256": result["candidateHashes"]["public" + inventory.TARGET],
                "proposed": proposed, "changedPaths": sorted(changed)}

    result["firestoreRollback"] = capture("Firestore Rules", rules)
    result["hostingRollback"] = capture("Hosting", hosting)
    Path("pr614-preflight.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return int(bool(result["errors"]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    if parser.parse_args().offline:
        print(json.dumps(offline(), indent=2, sort_keys=True))
    else:
        raise SystemExit(live())
