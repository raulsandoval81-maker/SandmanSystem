#!/usr/bin/env python3
"""Two NEW Sprint 1 staging callables only. Never update existing Functions."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
PROJECT = "sandman-combat-staging"
REGION = "us-central1"
WORKFLOW = "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main"
SOURCE_SHA = "0e9d96e3994094fffacbb606ac77f474902bf666"
RUNTIME = "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com"
BUILDER = "projects/sandman-combat-staging/serviceAccounts/sandman-practice-build@sandman-combat-staging.iam.gserviceaccount.com"
DEPLOYER = "sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com"
NAMES = ("getAthleteProfileFeed", "getAthleteSkillsSummary")
EVIDENCE = Path("athlete-sprint1-functions-deploy-evidence.json")


def need(test, message):
    if not test:
        raise RuntimeError(message)


def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()


def save(value):
    EVIDENCE.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def import_readonly():
    path = HERE.parent / "athlete-sprint1-readonly-preflight.py"
    spec = importlib.util.spec_from_file_location("athlete_sprint1_readonly", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def expected():
    return json.loads((HERE / "release-manifest.json").read_text())


def check_guard(mode):
    for key, expected_value in {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": WORKFLOW,
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "CONFIRM_PROJECT": PROJECT,
        "SPRINT1_ACTION": ("athlete-sprint1-release-preflight" if mode == "preflight"
                           else "athlete-sprint1-staging-deploy"),
    }.items():
        need(os.environ.get(key) == expected_value, "Protected staging guard mismatch: " + key)
    if mode == "deploy":
        need(os.environ.get("SPRINT1_APPROVAL") ==
             "APPROVE_ATHLETE_SPRINT1_STAGING_FUNCTIONS_RULES_HOSTING",
             "Explicit all-components staging release approval required")
        need(os.environ.get("SPRINT1_TRANSPORT_APPROVAL") ==
             "APPROVE_STAGING_APPLICATION_AUTH_TRANSPORT",
             "Explicit app-auth transport approval required")


def function_inventory():
    module = import_readonly()
    token = run("gcloud", "auth", "print-access-token")
    endpoint = f"https://cloudfunctions.googleapis.com/v2/projects/{PROJECT}/locations/-/functions"
    rows = module.paged(endpoint, "functions", token)
    return {
        x["name"]: {
            "name": x["name"], "state": x.get("state"), "updateTime": x.get("updateTime"),
            "runtime": x.get("buildConfig", {}).get("runtime"),
            "revision": x.get("serviceConfig", {}).get("revision")
        } for x in rows
    }


def check_baseline():
    baseline = json.loads(Path(os.environ["SPRINT1_BASELINE_JSON"]).read_text())
    current = function_inventory()
    previous = {x["name"]: x for x in baseline["snapshot"]["functions"]["inventory"]}
    expected_new = {f"projects/{PROJECT}/locations/{REGION}/functions/{name}" for name in NAMES}
    need(len(previous) == len(current) == 53 and set(current) == set(previous),
         "Function list drift or Athlete targets pre-exist")
    need(current == previous, "Existing Function state or revisions changed")
    need(not expected_new.intersection(current), "Athlete Function unexpectedly pre-exists")
    need(expected()["functions"] == [
        {"generation": "v2", "mode": "create-only", "name": n,
         "region": "us-central1", "sourcePath": "functions/src/modules/athlete/" + n + ".ts"} for n in NAMES],
         "Function manifest deviated from exactly two reviewed additions")
    return baseline, previous


def inspect_created(name, token):
    module = import_readonly()
    url = f"https://cloudfunctions.googleapis.com/v2/projects/{PROJECT}/locations/{REGION}/functions/{name}"
    fn = module.api(url, token)
    need(fn.get("state") == "ACTIVE" and fn.get("environment") == "GEN_2",
         "New Function is not active Gen 2")
    need(fn.get("buildConfig", {}).get("entryPoint") == name and
         fn.get("buildConfig", {}).get("runtime") == "nodejs22", "Function source entrypoint changed")
    svc = fn.get("serviceConfig", {})
    need(svc.get("serviceAccountEmail") == RUNTIME and
         not svc.get("secretEnvironmentVariables") and
         fn.get("labels", {}).get("sandman-athlete-sprint1") == "v1",
         "Function runtime identity/secrets/release label mismatch")
    return {
        "name": fn["name"], "state": fn["state"], "runtime": fn["buildConfig"]["runtime"],
        "entryPoint": fn["buildConfig"]["entryPoint"], "revision": svc.get("revision"),
        "serviceAccount": RUNTIME
    }


def deploy(source):
    check_guard("deploy")
    m = expected()
    need(m["deploymentAuthorized"] is False and m["productionAuthorized"] is False,
         "Manifest self-authorized a deployment")
    need(Path(source).is_dir() and (Path(source) / "index.cjs").is_file(),
         "Verified isolated source package missing")
    _, previous = check_baseline()
    # Fail before ANY write if no explicit review of the existing staging runtime account.
    # These accounts are already used by the staging Enrollment callable release.
    principal = run("gcloud", "iam", "service-accounts", "describe", RUNTIME,
                    "--project=" + PROJECT, "--format=value(email)")
    need(principal == RUNTIME, "Previously established staging runtime service account missing")
    status = {"status": "STOP_NO_RETRY", "project": PROJECT,
              "sourceSha": SOURCE_SHA, "runtime": RUNTIME, "created": [],
              "lastOperation": "guard-verified", "rollback": "Review and delete only newly created callables"}
    save(status)
    for name in NAMES:
        # No attempt to update or salvage an existing callable.
        current = function_inventory()
        need(current == previous | {
            f"projects/{PROJECT}/locations/{REGION}/functions/{done['name']}": done["inventory"]
            for done in status.get("internal_created", [])},
            "Concurrent Functions drift before creation")
        need(f"projects/{PROJECT}/locations/{REGION}/functions/{name}" not in current,
             "Creation target already exists")
        status["lastOperation"] = "create-" + name
        save(status)
        subprocess.run([
            "gcloud", "functions", "deploy", name, "--gen2",
            "--project=" + PROJECT, "--region=" + REGION,
            "--runtime=nodejs22", "--entry-point=" + name,
            "--source=" + str(Path(source).resolve()),
            "--run-service-account=" + RUNTIME,
            "--build-service-account=" + BUILDER,
            "--cpu=1", "--memory=256Mi", "--timeout=60s",
            "--max-instances=20", "--concurrency=80",
            "--ingress-settings=all", "--trigger-http",
            "--no-allow-unauthenticated",
            "--update-labels=sandman-athlete-sprint1=v1,sandman-source-sha=" + SOURCE_SHA,
            "--clear-secrets", "--quiet",
        ], check=True)
        svc = name.lower()
        status["lastOperation"] = "enable-application-auth-transport-" + name
        save(status)
        subprocess.run(["gcloud", "run", "services", "update", svc,
                        "--project=" + PROJECT, "--region=" + REGION,
                        "--no-invoker-iam-check", "--quiet"], check=True)
        token = run("gcloud", "auth", "print-access-token")
        record = inspect_created(name, token)
        after = function_inventory()
        expected_name = f"projects/{PROJECT}/locations/{REGION}/functions/{name}"
        need(set(after) == set(previous) | {
             f"projects/{PROJECT}/locations/{REGION}/functions/{row['name']}"
             for row in status["created"]} | {expected_name},
             "An unrelated staging Function appeared during release")
        need(all(after[p] == previous[p] for p in previous),
             "Existing staging Function changed during release")
        status["created"].append(record)
        status["lastOperation"] = "verified-" + name
        save(status)
    status["status"] = "PASS_TWO_NEW_CALLABLES_PENDING_RULES_HOSTING"
    save(status)
    return status


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["preflight", "deploy"])
    parser.add_argument("--source", type=Path)
    args = parser.parse_args()
    if args.action == "preflight":
        check_guard("preflight")
        check_baseline()
        print("PASS_FUNCTION_CREATE_ONLY_PREFLIGHT_NO_MUTATION")
    else:
        need(args.source is not None, "Missing isolated source package")
        deploy(args.source)


if __name__ == "__main__":
    main()
