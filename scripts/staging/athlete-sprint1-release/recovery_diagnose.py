#!/usr/bin/env python3
"""Read-only reconciliation of partial Sprint 1 run #469. No cloud writes or IAM changes."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

HERE = Path(__file__).resolve().parent
PROJECT = "sandman-combat-staging"
REGION = "us-central1"
WORKFLOW = "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main"
SOURCE_SHA = "0e9d96e3994094fffacbb606ac77f474902bf666"
BASELINE_RUN = 46086011747
FAILED_RUN = 46094443807
PROFILE = "getAthleteProfileFeed"
SKILLS = "getAthleteSkillsSummary"
PRINCIPALS = {
    "sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com",
    "sandman-staging-deployer@sandman-combat-staging.iam.gserviceaccount.com",
}
OUT = Path("sprint1-partial-recovery-diagnostic.json")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_api(token, url):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response)


def test_permissions(token, url, perms):
    # POST only to Google's read-only testIamPermissions endpoint.
    require(url.startswith(("https://run.googleapis.com/v2/projects/" + PROJECT + "/",
                            "https://cloudresourcemanager.googleapis.com/v1/projects/" + PROJECT)),
            "Permission probe target must be staging")
    require(url.endswith(":testIamPermissions"), "Only read-only IAM tests permitted")
    request = urllib.request.Request(url,
        data=json.dumps({"permissions": sorted(perms)}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(request, timeout=45) as response:
        return set(json.load(response).get("permissions", []))


def snapshot_module():
    script = HERE.parent / "athlete-sprint1-readonly-preflight.py"
    spec = importlib.util.spec_from_file_location("sprint1_staging_snapshot", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def diagnose(baseline, partial_receipt, principal, token):
    require(baseline["status"] == "PASS_READ_ONLY"
            and baseline["sourceSha"] == SOURCE_SHA
            and baseline["snapshot"]["project"] == PROJECT
            and baseline["snapshot"]["projectNumber"] == "991554514268", "Original baseline mismatch")
    require(partial_receipt["status"] == "STOP_NO_RETRY"
            and partial_receipt["project"] == PROJECT
            and partial_receipt["sourceSha"] == SOURCE_SHA
            and partial_receipt["lastOperation"] ==
                "enable-application-auth-transport-getAthleteProfileFeed"
            and partial_receipt["created"] == [], "Unexpected partial-release receipt")
    previous = baseline["snapshot"]
    current = snapshot_module().snapshot(token)
    require(current["project"] == PROJECT and current["projectNumber"] == previous["projectNumber"],
            "Unexpected project identity")
    require(current["firestore"] == previous["firestore"], "Staging Firestore has changed")
    require(current["hosting"] == previous["hosting"], "Staging Hosting has changed")
    prev_functions = {f["name"]: f for f in previous["functions"]["inventory"]}
    now_functions = {f["name"]: f for f in current["functions"]["inventory"]}
    profile_name = f"projects/{PROJECT}/locations/{REGION}/functions/{PROFILE}"
    skills_name = f"projects/{PROJECT}/locations/{REGION}/functions/{SKILLS}"
    require(len(prev_functions) == 53 and len(now_functions) == 54, "Unexpected Function count")
    require(set(now_functions) - set(prev_functions) == {profile_name}
            and skills_name not in now_functions,
            "Function scope deviates from one profile creation")
    require(all(now_functions.get(k) == v for k, v in prev_functions.items()),
            "A preexisting Function has changed")
    require(now_functions[profile_name]["state"] == "ACTIVE"
            and now_functions[profile_name]["runtime"] == "nodejs22",
            "Profile Function is not healthy")
    fn = read_api(token,
        f"https://cloudfunctions.googleapis.com/v2/{profile_name}")
    require(fn.get("environment") == "GEN_2" and fn.get("state") == "ACTIVE"
            and fn.get("buildConfig", {}).get("entryPoint") == PROFILE
            and fn.get("buildConfig", {}).get("runtime") == "nodejs22", "Profile deployment mismatch")
    require(fn.get("serviceConfig", {}).get("serviceAccountEmail") ==
            f"sandman-billing-runtime@{PROJECT}.iam.gserviceaccount.com",
            "Unexpected Function runtime identity")
    require(not fn.get("serviceConfig", {}).get("secretEnvironmentVariables"),
            "Unexpected Function secret")
    require(fn.get("labels", {}).get("sandman-source-sha") == SOURCE_SHA
            and fn.get("labels", {}).get("sandman-athlete-sprint1") == "v1",
            "Function provenance unknown")
    service_name = f"projects/{PROJECT}/locations/{REGION}/services/{PROFILE.lower()}"
    service = read_api(token, "https://run.googleapis.com/v2/" + service_name)
    require(service.get("name") == service_name and
            service.get("invokerIamDisabled") is not True,
            "Cloud Run transport already changed; reassess separately")
    project_perms = {"run.services.setIamPolicy", "run.services.update",
                     "cloudfunctions.functions.create"}
    service_perms = {"run.services.setIamPolicy", "run.services.update"}
    project_allowed = test_permissions(token,
        f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions",
        project_perms)
    service_allowed = test_permissions(token,
        "https://run.googleapis.com/v2/" + service_name + ":testIamPermissions",
        service_perms)
    return {
        "status": "PASS_READ_ONLY_PARTIAL_PROFILE_VERIFIED",
        "project": PROJECT, "originalBaselineRun": BASELINE_RUN,
        "failedRun": FAILED_RUN, "sourceSha": SOURCE_SHA,
        "profile": {"name": PROFILE, "state": "ACTIVE", "invokerIamCheck": "enabled",
                    "sourceProvenanceMatched": True},
        "skills": {"name": SKILLS, "exists": False},
        "unchangedOriginalFunctions": len(prev_functions),
        "firestoreUnchanged": True, "hostingUnchanged": True,
        "principal": principal,
        "effectivePermissions": {
            "project": {p: p in project_allowed for p in sorted(project_perms)},
            "profileService": {p: p in service_allowed for p in sorted(service_perms)},
        },
        "canModifyExistingProfileTransport": "run.services.setIamPolicy" in service_allowed,
        "canCreateSecondFunction": "cloudfunctions.functions.create" in project_allowed,
        "readOnly": True, "deploymentAuthorized": False,
    }


def main():
    evidence = {"status": "STOP_NO_RETRY", "project": PROJECT, "readOnly": True,
                "deploymentAuthorized": False}
    try:
        required = {
            "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_WORKFLOW_REF": WORKFLOW,
            "SPRINT1_ACTION": "athlete-sprint1-recovery-readonly",
            "CONFIRM_PROJECT": PROJECT,
        }
        for key, value in required.items():
            require(os.environ.get(key) == value, "Trusted staging dispatch mismatch")
        principal = os.environ.get("SPRINT1_DIAGNOSTIC_PRINCIPAL", "")
        require(principal in PRINCIPALS, "Unrecognized diagnostic service account")
        baseline_raw = Path(os.environ["SPRINT1_BASELINE_JSON"]).read_bytes()
        receipt_raw = Path(os.environ["SPRINT1_PARTIAL_RECEIPT_JSON"]).read_bytes()
        m = json.loads((HERE / "release-manifest.json").read_text())
        require(hashlib.sha256(baseline_raw).hexdigest() == m["preflight"]["evidenceSha256"],
                "Original signed baseline evidence changed")
        baseline, receipt = json.loads(baseline_raw), json.loads(receipt_raw)
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token"], text=True,
            stderr=subprocess.DEVNULL).strip()
        evidence = diagnose(baseline, receipt, principal, token)
    except Exception as exc:
        evidence["failureType"] = type(exc).__name__
    finally:
        OUT.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n")
    print(json.dumps(evidence, sort_keys=True))
    if evidence["status"] != "PASS_READ_ONLY_PARTIAL_PROFILE_VERIFIED":
        sys.exit("STOP_NO_RETRY — partial staging state not yet reconciled")


if __name__ == "__main__":
    main()
