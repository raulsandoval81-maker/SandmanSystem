#!/usr/bin/env python3
"""PR505 staging metadata inventory: strictly read-only, sanitized evidence.

Runs only as approved workflow_dispatch from protected main. This script has no
deployment, Firestore, secret value, Stripe, or email operations.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
PLAN = json.loads((ROOT / "pr505-2c-readonly-plan.json").read_text())
PROJECT = "sandman-combat-staging"
REGION = "us-central1"
FUNCTIONS = ("sendProposalPrepaidCashReceipt", "sendEnrollmentIntakeEmail", "issueProposalEnrollmentHandoff", "recordProposalPrepaidCash")
HOSTING_SITE = "sandman-combat-staging"

def require(ok, message):
    if not ok:
        raise RuntimeError("READ_ONLY_PREFLIGHT_BLOCKED: " + message)

def cmd(*args):
    require(args[:2] == ("gcloud", "functions") or
            args[:3] == ("gcloud", "run", "services") or
            args[:2] == ("gcloud", "auth"), "unapproved command")
    require(args[0] == "gcloud", "only gcloud read commands")
    operation = " ".join(args)
    require(not any(word in operation for word in (" deploy ", " set-iam-policy ", " add-iam-policy ", " delete ", " update ", " create ", " secrets versions access ")), "mutating command blocked")
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout

def gjson(*args):
    return json.loads(cmd(*args))

def parse_function(name):
    try:
        f = gjson("gcloud", "functions", "describe", name, "--gen2",
                  "--project", PROJECT, "--region", REGION, "--format=json")
        gen = 2
    except subprocess.CalledProcessError:
        try:
            f = gjson("gcloud", "functions", "describe", name, "--no-gen2",
                      "--project", PROJECT, "--region", REGION, "--format=json")
            gen = 1
        except subprocess.CalledProcessError:
            if name == "sendProposalPrepaidCashReceipt":
                return {"name":name,"exists":False}, None
            raise RuntimeError("Existing Function could not be read: " + name)
    require(f.get("name", "").endswith("/functions/"+name), "Function identity mismatch: "+name)
    sc = f.get("serviceConfig", {})
    bc = f.get("buildConfig", {})
    env = sc.get("environmentVariables", {})
    secret_env = sc.get("secretEnvironmentVariables", [])
    function_result = {
        "name":name, "exists":True, "generation":gen,
        "state":f.get("state") or f.get("status"),
        "runtime":bc.get("runtime") or f.get("runtime"),
        "entryPoint":bc.get("entryPoint") or f.get("entryPoint"),
        "revision":sc.get("revision"),
        "serviceAccountEmail":sc.get("serviceAccountEmail") or f.get("serviceAccountEmail"),
        "uriPresent":bool(sc.get("uri") or f.get("httpsTrigger", {}).get("url")),
        "environmentVariableNames":sorted(env.keys()),
        "secretBindings":[{"key":v.get("key"),"secret":v.get("secret"),"version":v.get("version")} for v in secret_env],
        "buildEnvironmentNames":sorted(bc.get("environmentVariables", {}).keys()),
        "labels":f.get("labels", {}),
        "updateTime":f.get("updateTime") or f.get("update_time"),
    }
    # Do not expose service URLs, environment values, or secret payloads.
    iam = gjson("gcloud", "functions", "get-iam-policy", name, "--project", PROJECT,
                "--region", REGION, "--format=json")
    function_result["iamDigestSha256"] = hashlib.sha256(json.dumps(iam, sort_keys=True).encode()).hexdigest()
    function_result["iamBindingCount"] = len(iam.get("bindings", []))
    run_result = None
    if gen == 2:
        service = name.lower()
        run = gjson("gcloud", "run", "services", "describe", service, "--project", PROJECT,
                    "--region", REGION, "--format=json")
        runiam = gjson("gcloud", "run", "services", "get-iam-policy", service, "--project",
                       PROJECT, "--region", REGION, "--format=json")
        spec = run.get("spec", {}).get("template", {}).get("spec", {})
        status = run.get("status", {})
        run_result = {
            "name":service, "latestReadyRevision":status.get("latestReadyRevisionName"),
            "latestCreatedRevision":status.get("latestCreatedRevisionName"),
            "traffic":[{"revisionName":v.get("revisionName"),"percent":v.get("percent")} for v in status.get("traffic", [])],
            "runtimeServiceAccount":spec.get("serviceAccountName"),
            "ingress":run.get("metadata", {}).get("annotations", {}).get("run.googleapis.com/ingress"),
            "invokerIamDisabled":run.get("metadata", {}).get("annotations", {}).get("run.googleapis.com/invoker-iam-disabled"),
            "iamDigestSha256":hashlib.sha256(json.dumps(runiam, sort_keys=True).encode()).hexdigest(),
            "iamBindingCount":len(runiam.get("bindings", [])),
        }
    return function_result, run_result

def get_hosting(url, token):
    request = urllib.request.Request(url, headers={"Authorization":"Bearer "+token})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())

def main():
    expect = {
        "GITHUB_REPOSITORY":"raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF":"refs/heads/main",
        "GITHUB_EVENT_NAME":"workflow_dispatch",
        "CONFIRM_PROJECT":PROJECT,
        "RELEASE_ACTION":"validate"
    }
    for key, value in expect.items():
        require(os.environ.get(key) == value, key+" boundary mismatch")
    require(os.environ.get("APPROVE_RELEASE", "") == "", "approval field prohibited on read-only run")
    require(PLAN["applicationSha"] == "d2a9fcce0e820c31270bb689b40fabbdf9832a07", "application SHA drift")
    require(PLAN["deploymentAuthorized"] is False and PLAN["productionAuthorized"] is False, "no release authorization")
    require(PLAN["hostingSite"] == HOSTING_SITE, "Hosting scope")
    functions = {}
    run_services = {}
    for name in FUNCTIONS:
        f, run = parse_function(name)
        functions[name] = f
        if run is not None:
            run_services[name] = run
    require(functions["sendProposalPrepaidCashReceipt"]["exists"] is False, "new 2C callable already exists; investigate deployment drift")
    for name in FUNCTIONS[1:]:
        require(functions[name]["exists"], "existing dependent callable is absent: "+name)
    # Hosting v1 REST GET only. Do not fetch version file blobs.
    token = cmd("gcloud", "auth", "print-access-token").strip()
    require(bool(token), "read-only Hosting access token unavailable")
    base = "https://firebasehosting.googleapis.com/v1beta1/sites/" + HOSTING_SITE
    response = get_hosting(base + "/releases?pageSize=1", token)
    releases = response.get("releases", [])
    require(len(releases)==1, "cannot determine latest Hosting release")
    release = releases[0]
    version_name = release.get("version", {}).get("name") if isinstance(release.get("version"), dict) else release.get("version", "")
    require(str(version_name).startswith("sites/"+HOSTING_SITE+"/versions/"), "unexpected Hosting version name")
    version = get_hosting("https://firebasehosting.googleapis.com/v1beta1/"+version_name, token)
    # Read every page of the published Hosting file manifest. Capture only hashes
    # and file paths, never file contents. Stop if pagination is inconsistent.
    from urllib.parse import quote
    file_entries = {}
    next_page = ""
    seen_tokens = set()
    for _ in range(100):
        suffix = "?pageSize=1000"
        if next_page:
            require(next_page not in seen_tokens, "Hosting file manifest pagination loop")
            seen_tokens.add(next_page)
            suffix += "&pageToken=" + quote(next_page, safe="")
        files_page = get_hosting(
            "https://firebasehosting.googleapis.com/v1beta1/" + version_name + "/files" + suffix,
            token
        )
        for item in files_page.get("files", []):
            path = item.get("path", "")
            require(path.startswith("/") and path not in file_entries, "Invalid or duplicate Hosting file path")
            file_entries[path] = item.get("hash", "")
        next_page = files_page.get("nextPageToken", "")
        if not next_page:
            break
    else:
        raise RuntimeError("Hosting file inventory exceeded 100 pages")
    require(len(file_entries) > 0, "Hosting manifest is empty")
    expected_count = version.get("fileCount")
    if expected_count is not None:
        require(int(expected_count) == len(file_entries), "Hosting fileCount mismatch")
    selected = PLAN["hostingAssets"]
    require(all(file_entries.get(asset) for asset in selected), "One or more 2C Hosting assets absent from live baseline")
    manifest_digest = hashlib.sha256(
        json.dumps(sorted(file_entries.items()),separators=(",",":")).encode()
    ).hexdigest()
    hosting = {
        "site":HOSTING_SITE, "releaseName":release.get("name"),
        "versionName":version_name, "releaseType":release.get("type"),
        "releaseTime":release.get("releaseTime"), "versionStatus":version.get("status"),
        "versionFileCount":version.get("fileCount"),
        "versionConfigDigest":hashlib.sha256(json.dumps(version.get("config", {}),sort_keys=True).encode()).hexdigest(),
        "fullFileManifestVerified":True,
        "fullFileCount":len(file_entries), "fullFileManifestSha256":manifest_digest,
        "2cAssetBaselineHashes":{asset:file_entries[asset] for asset in selected}
    }
    report = {
        "status":"PR505_STAGING_METADATA_READONLY_CAPTURE_NO_DEPLOY",
        "project":PROJECT, "sourceSha":PLAN["applicationSha"],
        "functions":functions, "runServices":run_services, "hosting":hosting,
        "iamValuesRedacted":True, "secretValuesRead":False,
        "deploymentAuthorized":False, "productionAuthorized":False,
        "fullHostingManifestVerified":True
    }
    out = Path(os.environ.get("PR505_EVIDENCE_FILE","pr505-readonly-evidence.json"))
    out.write_text(json.dumps(report,indent=2,sort_keys=True)+"\n")
    print("PR505_STAGING_METADATA_CAPTURED_NO_DEPLOY")
    print("Function targets:",", ".join(FUNCTIONS))
    print("Hosting baseline recorded:",bool(hosting["releaseName"]),bool(hosting["versionName"]))
    print("No deployment; no secret values read.")

if __name__=="__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, urllib.error.URLError, KeyError, ValueError) as exc:
        # Never print gcloud stderr, tokens, or authorization payloads.
        print("PR505_STAGING_READONLY_PREFLIGHT_BLOCKED", type(exc).__name__, file=sys.stderr)
        sys.exit(1)
