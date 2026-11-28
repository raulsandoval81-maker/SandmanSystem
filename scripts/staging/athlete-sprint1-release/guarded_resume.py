#!/usr/bin/env python3
"""Guarded Sprint 1 partial-state resume. Staging only; STOP_NO_RETRY on any drift.

The first Profile callable was created in run #469, but its separate Cloud Run
invoker-transport update failed. This script NEVER redeploys that existing
function. Skills Summary is added using the create-only Functions v2 REST API.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

HERE = Path(__file__).resolve().parent
PROJECT = "sandman-combat-staging"
REGION = "us-central1"
SOURCE_SHA = "0e9d96e3994094fffacbb606ac77f474902bf666"
WORKFLOW = ("raulsandoval81-maker/SandmanSystem/.github/workflows/"
            "staging-exact-sha-release.yml@refs/heads/main")
ACTION = "athlete-sprint1-staging-resume"
STAGING_DEPLOYER = "sandman-staging-deployer@sandman-combat-staging.iam.gserviceaccount.com"
PRACTICE_DEPLOYER = "sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com"
RUNTIME = "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com"
BUILDER = "sandman-practice-build@sandman-combat-staging.iam.gserviceaccount.com"
PROFILE = "getAthleteProfileFeed"
SKILLS = "getAthleteSkillsSummary"
PARENT = f"projects/{PROJECT}/locations/{REGION}"
PROFILE_ID = f"{PARENT}/functions/{PROFILE}"
SKILLS_ID = f"{PARENT}/functions/{SKILLS}"
CF_API = "https://cloudfunctions.googleapis.com/v2/"
RUN_API = "https://run.googleapis.com/v2/"
PROJECT_API = "https://cloudresourcemanager.googleapis.com/v1/"
IAM_API = "https://iam.googleapis.com/v1/"
EVIDENCE = Path("athlete-sprint1-resume-evidence.json")
RECEIPT_SHA = "84974b32bb0a7e0d18846c7b7b9bebe5707466596d89763e9db50bfb394856ae"


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def save(data):
    EVIDENCE.write_text(json.dumps(data, sort_keys=True, indent=2) + "\n")


def load_py(filename):
    p = HERE / filename
    spec = importlib.util.spec_from_file_location(filename.replace(".", "_"), p)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def guard(mode):
    for k, v in {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_WORKFLOW_REF": WORKFLOW,
        "GITHUB_RUN_ATTEMPT": "1",
        "SPRINT1_ACTION": ACTION,
        "CONFIRM_PROJECT": PROJECT,
    }.items():
        require(os.environ.get(k) == v, "Protected staging context mismatch: " + k)
    if mode == "execute":
        require(os.environ.get("SPRINT1_APPROVAL") ==
                "APPROVE_SPRINT1_PARTIAL_RESUME_STAGING_ONLY",
                "A new, explicit partial-resume approval is required")
        require(os.environ.get("SPRINT1_TRANSPORT_APPROVAL") ==
                "APPROVE_STAGING_APPLICATION_AUTH_TRANSPORT",
                "Application-auth transport approval required")


def token():
    return subprocess.check_output(["gcloud", "auth", "print-access-token"],
                                   text=True, stderr=subprocess.DEVNULL).strip()


def request(t, url, method="GET", body=None):
    require(url.startswith((CF_API + f"projects/{PROJECT}/",
                            RUN_API + f"projects/{PROJECT}/")),
            "Cloud resource outside staging")
    hdr = {"Authorization": "Bearer " + t}
    if body is not None:
        hdr["Content-Type"] = "application/json"
    payload = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=payload, headers=hdr, method=method)
    with urllib.request.urlopen(req, timeout=55) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}


def permission_probe(t, url, perms):
    allowed = (
        url == PROJECT_API + f"projects/{PROJECT}:testIamPermissions"
        or url in {
            IAM_API + "projects/-/serviceAccounts/" + RUNTIME + ":testIamPermissions",
            IAM_API + "projects/-/serviceAccounts/" + BUILDER + ":testIamPermissions",
        }
    )
    require(allowed, "Permission probe must target an approved staging resource")
    q = urllib.request.Request(
        url, data=json.dumps({"permissions": sorted(perms)}).encode(),
        headers={"Authorization": "Bearer " + t, "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(q, timeout=40) as response:
        return set(json.load(response).get("permissions", []))


def evidence_inputs():
    manifest = json.loads((HERE / "release-manifest.json").read_text())
    baseline_raw = Path(os.environ["SPRINT1_BASELINE_JSON"]).read_bytes()
    receipt_raw = Path(os.environ["SPRINT1_PARTIAL_RECEIPT_JSON"]).read_bytes()
    require(sha(baseline_raw) == manifest["preflight"]["evidenceSha256"],
            "Certified baseline evidence hash mismatch")
    require(sha(receipt_raw) == RECEIPT_SHA, "Failed run #469 receipt hash mismatch")
    require(manifest["deploymentAuthorized"] is False and
            manifest["productionAuthorized"] is False and
            manifest["sourceSha"] == SOURCE_SHA and
            manifest["expectedBaseline"]["functionsCount"] == 53,
            "Release manifest cannot self-authorize")
    require(manifest["functions"] == [
        {"generation": "v2", "mode": "create-only", "name": name,
         "region": REGION, "sourcePath": "functions/src/modules/athlete/" + name + ".ts"}
        for name in (PROFILE, SKILLS)], "Approved Function scope changed")
    return json.loads(baseline_raw), json.loads(receipt_raw)


def preflight(source=None):
    guard("preflight")
    baseline, receipt = evidence_inputs()
    t = token()
    recovery = load_py("recovery_diagnose.py")
    report = recovery.diagnose(baseline, receipt, STAGING_DEPLOYER, t)
    # Cloud Run gcloud services update requires actAs on the existing runtime
    # account, even for an invoker-transport-only change. Run #474 proved the
    # project-level Run permissions alone are insufficient. The practice
    # deployer is checked separately for Skills create-only access.
    need = {"run.services.update", "run.services.setIamPolicy"}
    have = permission_probe(t, PROJECT_API + f"projects/{PROJECT}:testIamPermissions", need)
    require(need.issubset(have) and
            report["canModifyExistingProfileTransport"] and
            report["effectivePermissions"]["profileService"]["run.services.update"],
            "Staging transport identity lacks Cloud Run update permissions")
    # Exact SA-scoped check as the actual staging transport identity.
    # Never request iam.serviceAccountUser on the project or other accounts.
    runtime_scope = IAM_API + "projects/-/serviceAccounts/" + RUNTIME + ":testIamPermissions"
    act_as = permission_probe(t, runtime_scope, {"iam.serviceAccounts.actAs"})
    require("iam.serviceAccounts.actAs" in act_as,
            "Staging transport identity lacks iam.serviceAccounts.actAs on " + RUNTIME)
    rules = load_py("release_rules_hosting.py")
    current = rules.read_rules(t, baseline["snapshot"]["firestore"]["ruleset"])
    candidate = rules.reviewed_rules_patch(current)
    require(sha(candidate.encode()) == rules.manifest()["sourceFilesSha256"][
        "scripts/staging/p0-containment/firestore.rules"],
        "Reviewed Firestore source changed")
    require(len(rules.approved_hosting_bytes()) == 18,
            "Approved Hosting overlay count changed")
    if source is not None:
        require(source.is_dir() and (source / "index.cjs").is_file(),
                "Exact two-callable source package not prepared")
        names = {p.relative_to(source).as_posix() for p in source.rglob("*") if p.is_file()}
        require(names == {
            "index.cjs", "package.json", "package-lock.json",
            "lib/modules/athlete/getAthleteProfileFeed.js",
            "lib/modules/athlete/getAthleteSkillsSummary.js",
            "lib/services/athleteProfileReadAuthorization.js",
            "lib/services/staffAuthorization.js"}, "Unapproved build package contents")
    return baseline, report



def preflight_practice():
    """One no-mutation check under practice-deployer, not the staging-deployer.

    The practice principal created the existing Profile in #469 and can use
    Cloud Functions create-only. The staging principal separately owns transport.
    Do NOT call recovery.diagnose here: this narrower identity cannot read all
    of the staging inventory. The stage job has already reconciled it.
    """
    guard("preflight")
    evidence_inputs()  # verify immutable baseline and #469 partial receipt
    t = token()
    needed = {"cloudfunctions.functions.create",
              "cloudfunctions.functions.sourceCodeSet"}
    allowed = permission_probe(
        t, PROJECT_API + f"projects/{PROJECT}:testIamPermissions", needed)
    missing = sorted(needed - allowed)
    for account in (RUNTIME, BUILDER):
        permitted = permission_probe(
            t, IAM_API + "projects/-/serviceAccounts/" + account + ":testIamPermissions",
            {"iam.serviceAccounts.actAs"})
        if "iam.serviceAccounts.actAs" not in permitted:
            missing.append("iam.serviceAccounts.actAs on " + account)
    # Include all deficiencies in the report; never infer the missing grants.
    require(not missing,
            "Practice create-only identity lacks verified permissions: " + ", ".join(missing))
    return {"status": "PASS_PRACTICE_CREATE_ONLY_PERMISSION_PREFLIGHT",
            "project": PROJECT, "principal": PRACTICE_DEPLOYER,
            "verifiedAccounts": [RUNTIME, BUILDER],
            "runId": os.environ.get("GITHUB_RUN_ID"),
            "deploymentAuthorized": False, "readOnly": True}


def stage_receipt(env_name, expected_status):
    """Require evidence from the immediately preceding job in the SAME run."""
    path = os.environ.get(env_name, "")
    require(bool(path), "Missing protected same-run handoff: " + env_name)
    record = json.loads(Path(path).read_text())
    require(record.get("status") == expected_status and
            record.get("project") == PROJECT and
            record.get("sourceSha") == SOURCE_SHA and
            record.get("runId") == os.environ.get("GITHUB_RUN_ID") and
            record.get("profileRedeployed") is False and
            record.get("deploymentAuthorized") is True,
            "Same-run protected staging receipt invalid: " + expected_status)
    return record



def validate_transport(t, name, expected):
    svc = request(t, RUN_API + f"{PARENT}/services/{name.lower()}")
    actual = svc.get("invokerIamDisabled") is True
    require(svc["name"] == f"{PARENT}/services/{name.lower()}" and
            actual is expected,
            "Cloud Run transport status mismatch: " + name)
    return True


def preserve_inventory(baseline, t, require_skills):
    recover = load_py("recovery_diagnose.py")
    now = recover.snapshot_module().snapshot(t)
    before = baseline["snapshot"]
    require(now["project"] == PROJECT and
            now["firestore"] == before["firestore"] and
            now["hosting"] == before["hosting"], "Rules/Hosting baseline drift during resume")
    a = {x["name"]: x for x in before["functions"]["inventory"]}
    b = {x["name"]: x for x in now["functions"]["inventory"]}
    require(len(a) == 53 and all(b.get(k) == v for k, v in a.items()),
            "A preexisting staging Function changed")
    expected = {PROFILE_ID, SKILLS_ID} if require_skills else {PROFILE_ID}
    require(set(b) - set(a) == expected, "Unexpected Function added during resume")
    require(all(b[x]["state"] == "ACTIVE" for x in expected),
            "One or more Athlete callables not ACTIVE")
    return b


def profile_untouched(t):
    recover = load_py("recovery_diagnose.py")
    f = recover.read_api(t, CF_API + PROFILE_ID)
    require(f.get("state") == "ACTIVE" and f.get("environment") == "GEN_2" and
            f.get("buildConfig", {}).get("entryPoint") == PROFILE and
            f.get("buildConfig", {}).get("runtime") == "nodejs22" and
            f.get("serviceConfig", {}).get("serviceAccountEmail") == RUNTIME and
            not f.get("serviceConfig", {}).get("secretEnvironmentVariables") and
            f.get("labels", {}).get("sandman-source-sha") == SOURCE_SHA and
            f.get("labels", {}).get("sandman-athlete-sprint1") == "v1",
            "Existing Profile source/runtime provenance changed")
    return True


def package_zip(source):
    allowed = {p.relative_to(source).as_posix() for p in source.rglob("*") if p.is_file()}
    require(len(allowed) == 7 and not any(p.is_symlink() for p in source.rglob("*")),
            "Unexpected source package or symbolic link")
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(allowed):
            require(".." not in Path(item).parts and not item.startswith("."),
                    "Unsafe package archive path")
            archive.write(source / item, item)
    raw = payload.getvalue()
    require(0 < len(raw) < 20 * 1024 * 1024,
            "Source archive size outside reviewed limit")
    return raw


def create_skills(t, source, status):
    """ONE create-only mutation. ALREADY_EXISTS is a fatal concurrency conflict."""
    # The prior staging identity has already reconciled all 53 baseline
    # Functions and asserted Skills is absent. This separate practice identity
    # may lack the broad list permissions used by preserve_inventory. The
    # Functions v2 POST + functionId is atomic create-only, never an update.
    require(status.get("profileHandoffVerified") is True,
            "Same-run verified staging handoff required before create-only Skills")
    upload = request(t, CF_API + PARENT + "/functions:generateUploadUrl", "POST",
                     {"environment": "GEN_2"})
    url, storage = upload.get("uploadUrl"), upload.get("storageSource")
    require(isinstance(url, str) and
            urllib.parse.urlparse(url).scheme == "https" and
            urllib.parse.urlparse(url).hostname == "storage.googleapis.com" and
            isinstance(storage, dict) and storage.get("bucket") and storage.get("object"),
            "Generated Cloud Functions source URL not trusted")
    z = package_zip(source)
    status["lastOperation"] = "upload-staging-skill-source"
    status["archiveSha256"] = sha(z)
    save({k: v for k, v in status.items() if k != "baseline"})
    # Signed URL must NEVER receive a bearer credential.
    upload_req = urllib.request.Request(
        url, data=z, method="PUT", headers={"Content-Type": "application/zip"})
    with urllib.request.urlopen(upload_req, timeout=120) as response:
        require(response.status in (200, 201, 204), "Source upload rejected")
    body = {
        "name": SKILLS_ID, "environment": "GEN_2",
        "buildConfig": {
            "runtime": "nodejs22", "entryPoint": SKILLS,
            "source": {"storageSource": storage},
            "serviceAccount": f"projects/{PROJECT}/serviceAccounts/{BUILDER}",
        },
        "serviceConfig": {
            "serviceAccountEmail": RUNTIME,
            "ingressSettings": "ALLOW_ALL",
            "availableMemory": "256Mi", "availableCpu": "1",
            "timeoutSeconds": 60, "maxInstanceCount": 20,
            "maxInstanceRequestConcurrency": 80,
        },
        "labels": {"sandman-athlete-sprint1": "v1",
                   "sandman-source-sha": SOURCE_SHA},
    }
    status["lastOperation"] = "create-only-submit-getAthleteSkillsSummary"
    save({k: v for k, v in status.items() if k != "baseline"})
    url = CF_API + PARENT + "/functions?" + urllib.parse.urlencode({"functionId": SKILLS})
    op = request(t, url, "POST", body)
    name = op.get("name", "")
    require(name.startswith(f"{PARENT}/operations/"), "Unexpected Functions operation target")
    status["skillsCreateOperation"] = name
    status["lastOperation"] = "create-only-operation-in-progress"
    save({k: v for k, v in status.items() if k != "baseline"})
    # Read-only operation polling; never retry POST on 409, permission error, or timeout.
    end = time.monotonic() + 1200
    while time.monotonic() < end:
        response = request(t, CF_API + name)
        if response.get("done") is True:
            require(not response.get("error") and response.get("response", {}).get(
                "name") == SKILLS_ID, "Create-only operation failed")
            return
        time.sleep(12)
    raise RuntimeError("Create-only operation still pending; STOP_NO_RETRY")


def verify_unauthenticated_denial(name):
    url = f"https://us-central1-{PROJECT}.cloudfunctions.net/{name}"
    raw = json.dumps({"data": {"athleteId": "SYNTHETIC_NONEXISTENT"}}).encode()
    req = urllib.request.Request(
        url, method="POST", data=raw,
        headers={"Content-Type": "application/json",
                 "Origin": f"https://{PROJECT}.web.app"})
    try:
        with urllib.request.urlopen(req, timeout=35):
            raise RuntimeError("Anonymous callable accepted request: " + name)
    except urllib.error.HTTPError as err:
        body = err.read(10000).decode("utf-8", "replace").upper()
        require(err.code == 401 and "UNAUTHENTICATED" in body,
                "Unexpected anonymous callable response: " + name)


def execute_profile_transport(source):
    """Stage-deployer may update Profile transport; NEVER redeploy Profile."""
    guard("execute")
    require(source is not None, "Missing exact callable package")
    baseline, _ = preflight(source)
    t = token()
    status = {"status": "STOP_NO_RETRY", "project": PROJECT,
              "sourceSha": SOURCE_SHA, "failedRun": 46094443807,
              "runId": os.environ["GITHUB_RUN_ID"],
              "lastOperation": "verified-profile-preflight",
              "profileRedeployed": False, "deploymentAuthorized": True}
    save(status)
    profile_untouched(t)
    preserve_inventory(baseline, t, False)
    validate_transport(t, PROFILE, False)
    status["lastOperation"] = "enable-existing-profile-application-auth-transport"
    save(status)
    subprocess.run(["gcloud", "run", "services", "update", PROFILE.lower(),
                    f"--project={PROJECT}", f"--region={REGION}",
                    "--no-invoker-iam-check", "--quiet"], check=True)
    validate_transport(t, PROFILE, True)
    profile_untouched(t)
    preserve_inventory(baseline, t, False)
    verify_unauthenticated_denial(PROFILE)
    status["lastOperation"] = "existing-profile-transport-and-app-auth-verified"
    status["status"] = "PASS_PROFILE_TRANSPORT"
    save(status)


def execute_create_skills(source):
    """Practice-deployer creates only missing Skills, never changes existing."""
    guard("execute")
    require(source is not None, "Missing exact callable package")
    stage_receipt("SPRINT1_PROFILE_RECEIPT_JSON", "PASS_PROFILE_TRANSPORT")
    preflight_practice()
    t = token()
    status = {"status": "STOP_NO_RETRY", "project": PROJECT,
              "sourceSha": SOURCE_SHA, "runId": os.environ["GITHUB_RUN_ID"],
              "lastOperation": "verified-create-identity-and-profile-handoff",
              "profileRedeployed": False, "deploymentAuthorized": True,
              "skillsCreateOnly": True, "profileHandoffVerified": True}
    save(status)
    # A competing Skills creation triggers a 409 and STOP_NO_RETRY: no PATCH,
    # upsert, retry, or other original Function mutation can occur.
    create_skills(t, source, status)
    status["lastOperation"] = "skills-create-operation-verified"
    status["status"] = "PASS_SKILLS_CREATE_ONLY"
    save(status)


def execute_skills_transport():
    """Stage-deployer verifies Skills provenance, then enables app-auth transport."""
    guard("execute")
    stage_receipt("SPRINT1_SKILLS_RECEIPT_JSON", "PASS_SKILLS_CREATE_ONLY")
    baseline, _ = evidence_inputs()
    t = token()
    status = {"status": "STOP_NO_RETRY", "project": PROJECT,
              "sourceSha": SOURCE_SHA, "runId": os.environ["GITHUB_RUN_ID"],
              "lastOperation": "skills-transport-readonly-reconciliation",
              "profileRedeployed": False, "deploymentAuthorized": True}
    save(status)
    profile_untouched(t)
    preserve_inventory(baseline, t, True)
    validate_transport(t, PROFILE, True)
    skills = request(t, CF_API + SKILLS_ID)
    require(skills.get("state") == "ACTIVE" and
            skills.get("environment") == "GEN_2" and
            skills.get("buildConfig", {}).get("entryPoint") == SKILLS and
            skills.get("buildConfig", {}).get("runtime") == "nodejs22" and
            skills.get("buildConfig", {}).get("serviceAccount") ==
                f"projects/{PROJECT}/serviceAccounts/{BUILDER}" and
            skills.get("serviceConfig", {}).get("serviceAccountEmail") == RUNTIME and
            not skills.get("serviceConfig", {}).get("secretEnvironmentVariables") and
            skills.get("labels", {}).get("sandman-source-sha") == SOURCE_SHA and
            skills.get("labels", {}).get("sandman-athlete-sprint1") == "v1",
            "New Skills Function differs from approved exact source or identity")
    validate_transport(t, SKILLS, False)
    status["lastOperation"] = "enable-new-skills-application-auth-transport"
    save(status)
    subprocess.run(["gcloud", "run", "services", "update", SKILLS.lower(),
                    f"--project={PROJECT}", f"--region={REGION}",
                    "--no-invoker-iam-check", "--quiet"], check=True)
    validate_transport(t, SKILLS, True)
    verify_unauthenticated_denial(PROFILE)
    verify_unauthenticated_denial(SKILLS)
    profile_untouched(t)
    preserve_inventory(baseline, t, True)
    status["lastOperation"] = "both-callables-verified-app-authenticated"
    status["status"] = "PASS_TWO_CALLABLES_READY_FOR_RULES_HOSTING"
    save(status)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("preflight", "preflight-practice", "execute-profile", "execute-skills", "execute-transport"))
    parser.add_argument("--source", type=Path)
    args = parser.parse_args()
    try:
        if args.mode == "preflight":
            baseline, report = preflight(args.source)
            result = {"status": "PASS_READ_ONLY_GUARDED_RESUME", "project": PROJECT,
                      "deploymentAuthorized": False, "originalFunctions": 53,
                      "profileAlreadyCreated": True, "skillsExists": False,
                      "readOnly": True}
            save(result)
            print(json.dumps(result))
        elif args.mode == "preflight-practice":
            record = preflight_practice()
            save(record)
            print(json.dumps(record))
        elif args.mode == "execute-profile":
            execute_profile_transport(args.source)
        elif args.mode == "execute-skills":
            execute_create_skills(args.source)
        else:
            execute_skills_transport()
    except Exception as exc:
        if not EVIDENCE.exists():
            save({"status": "STOP_NO_RETRY", "project": PROJECT,
                  "lastOperation": "preflight-or-guard",
                  "failureType": type(exc).__name__,
                  "deploymentAuthorized": False})
        raise


if __name__ == "__main__":
    main()
