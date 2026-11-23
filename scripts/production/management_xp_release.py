"""Protected source-only release of the verified Management XP candidate."""
import copy
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import management_xp_preflight as xp

WORKFLOW = "management-xp-production-release.yml"
APPROVAL = "APPROVE_MANAGEMENT_XP_SINGLE_FUNCTION_RELEASE"
BEFORE_REVISION = xp.HISTORICAL_REVISION
BEFORE_IMAGE = xp.HISTORICAL_IMAGE
API = "https://cloudfunctions.googleapis.com/v2/"


def request(stage, url, method, data=None, token=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.build_opener(xp.inventory.NoRedirect()).open(req, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{stage} returned HTTP {error.code}") from None
    except (OSError, TimeoutError):
        raise RuntimeError(f"{stage} transport failed") from None


def json_request(stage, url, method, token, payload=None):
    return json.loads(request(stage, url, method,
                              None if payload is None else json.dumps(payload).encode(), token))


def upload_target(upload):
    parsed = urllib.parse.urlsplit(upload["uploadUrl"])
    xp.require(parsed.scheme == "https" and parsed.hostname == "storage.googleapis.com"
               and parsed.port in (None, 443) and not parsed.username and not parsed.password
               and not parsed.fragment, "Unexpected signed upload origin")
    storage = upload["storageSource"]
    xp.require(set(storage) == {"bucket", "object", "generation"}
               and all(isinstance(storage[key], str) and storage[key] for key in storage)
               and re.fullmatch(r"[1-9][0-9]*", storage["generation"]),
               "Upload does not identify an immutable source")
    path = urllib.parse.unquote(parsed.path)
    xp.require(path == f"/{storage['bucket']}/{storage['object']}",
               "Signed upload does not match its storage source")
    return storage


def configuration(state):
    """Keep service and security config, excluding source and revision pointers."""
    fn, run = copy.deepcopy((state["function"], state["run"]))
    for key in ("build", "source", "sourceProvenance"):
        fn["buildConfig"].pop(key, None)
    fn["serviceConfig"].pop("revision", None)
    for key in ("etag", "generation", "observedGeneration", "updateTime", "lastModifier",
                "latestCreatedRevision", "latestReadyRevision", "terminalCondition",
                "conditions", "trafficStatuses", "reconciling"):
        run.pop(key, None)
    run["template"].pop("revision", None)
    for container in run["template"]["containers"]:
        container.pop("image", None)
    return {
        "build": fn["buildConfig"], "service": fn["serviceConfig"], "run": run,
        "functionIam": state["functionIam"], "runIam": state["runIam"],
        "labels": fn.get("labels"), "eventTrigger": fn.get("eventTrigger"),
    }


def verify_new_build_source(function_build_config, build, resource, source):
    """Use authenticated Function build/source association when Cloud Build omits source.

    Never waive the separate new build-to-serving-image digest check.
    """
    xp.require(function_build_config.get("build") == resource,
               "New Function build resource identity drift")
    xp.require(xp.source_ref(function_build_config) == source,
               "New Function source identity drift")
    resolved = (build.get("sourceProvenance") or {}).get("resolvedStorageSource")
    configured = (build.get("source") or {}).get("storageSource")
    if resolved or configured:
        xp.require(xp.source_ref(build) == source,
                   "New Cloud Build source differs from Function source")
    else:
        xp.require(build.get("status") == "SUCCESS",
                   "New Cloud Build source pointer absent and build did not succeed")
        print(json.dumps({
            "status": "NEW_BUILD_SOURCE_CONFIRMED_VIA_FUNCTION_CONTROL_PLANE",
            "build": resource, "source": source,
            "cloudBuildSourcePointerPresent": False,
        }, sort_keys=True), flush=True)


def release(candidate):
    xp.require_workflow_scope(WORKFLOW)
    xp.require(os.environ.get("DEPLOYMENT_APPROVAL") == APPROVAL, "Missing exact deployment approval")
    token, snapshot, before, revision, image, package = xp.preflight(candidate, WORKFLOW)
    xp.require(revision == BEFORE_REVISION and image == BEFORE_IMAGE, "Reviewed production revision drift")
    xp.require(xp.sha(package) == xp.CANDIDATE_SHA256, "Unexpected release ZIP")
    expected = configuration(before)
    build_env = dict(before["function"]["buildConfig"].get("environmentVariables") or {})
    build_env["GOOGLE_NODE_RUN_SCRIPTS"] = ""
    expected["build"]["environmentVariables"] = build_env
    xp.require(snapshot() == before, "Production changed before source upload")
    upload = json_request("Generate source upload", API + xp.LOCATION + "/functions:generateUploadUrl",
                          "POST", token, {})
    storage = upload_target(upload)
    request("Upload exact candidate", upload["uploadUrl"], "PUT", package, content_type="application/zip")
    xp.require(snapshot() == before, "Production changed before the Function update")
    operation = json_request(
        "Update XP Function",
        xp.FUNCTION + "?updateMask=buildConfig.source.storageSource,buildConfig.environmentVariables",
        "PATCH", token,
        {"name": xp.LOCATION + "/functions/" + xp.TARGET,
         "buildConfig": {"source": {"storageSource": storage}, "environmentVariables": build_env}},
    )
    name = operation.get("name", "")
    xp.require(re.fullmatch(r"projects/(?:sandmandashboard|889326401061)/locations/us-central1/operations/[\w-]+",
                           name), "Unexpected update operation")
    print(json.dumps({"operation": name, "candidateSha256": xp.CANDIDATE_SHA256,
                      "rollback": xp.recovery.BASELINE}), flush=True)
    for _ in range(120):
        if operation.get("done"):
            break
        time.sleep(5)
        operation = json_request("Read update operation", API + name, "GET", token)
    xp.require(operation.get("done") and not operation.get("error"), "XP source update failed or timed out")

    after = snapshot()
    fn, service = after["function"], after["run"]
    source = xp.source_ref(fn["buildConfig"])
    xp.require(xp.read_archive(source, token) == package, "Deployed source differs from pinned candidate")
    xp.require(configuration(after) == expected, "Post-update configuration or IAM drift")
    new_revision = fn["serviceConfig"]["revision"]
    traffic = service["trafficStatuses"]
    xp.require(fn["state"] == "ACTIVE" and new_revision != revision
               and re.fullmatch(r"createmanagementxpadjustment-[0-9]+-[a-z0-9]+", new_revision)
               and service["latestReadyRevision"].split("/")[-1] == new_revision
               and service["terminalCondition"]["state"] == "CONDITION_SUCCEEDED"
               and not service.get("reconciling") and len(traffic) == 1
               and traffic[0]["revision"].split("/")[-1] == new_revision
               and traffic[0]["percent"] == 100, "Unexpected serving state after update")
    record = json.loads(xp.guarded_gcloud("Verify new revision digest", [
        "gcloud", "run", "revisions", "describe", new_revision, "--project", xp.PROJECT,
        "--region", xp.REGION, "--format=json",
    ]))
    new_image = record.get("status", {}).get("imageDigest", "")
    xp.require(record.get("metadata", {}).get("name") == new_revision
               and re.fullmatch(r"[^@]+@sha256:[0-9a-f]{64}", new_image),
               "Missing immutable image identity after update")
    resource = fn["buildConfig"]["build"]
    build = xp.build_record(resource)
    verify_new_build_source(fn["buildConfig"], build, resource, source)
    if build.get("results", {}).get("images", []):
        xp.verify_build_image(build, resource, new_image, new_revision)
    else:
        # Cloud Build may push images without populating results.images.
        # Never apply the historical exception to the NEW serving image.
        xp.verify_artifact_registry_provenance(build, resource, new_image, new_revision)
    xp.require(snapshot() == after, "Production drifted during verification")
    print(json.dumps({"status": "FUNCTION_RELEASE_VERIFIED", "revision": new_revision,
                      "image": new_image, "build": resource, "source": source}), flush=True)


def execute(mode, candidate):
    """Fail closed for every unknown mode; VERIFY_ONLY never uploads or patches."""
    xp.require(mode in ("VERIFY_ONLY", "DEPLOY"), "Invalid XP release mode")
    if mode == "VERIFY_ONLY":
        xp.require_workflow_scope(WORKFLOW)
        xp.require(os.environ.get("DEPLOYMENT_APPROVAL") == APPROVAL,
                   "Missing exact deployment approval")
        xp.preflight(candidate, WORKFLOW)
        print(json.dumps({"status": "READ_ONLY_BASELINE_VERIFIED", "deploymentAttempted": False}))
        return
    release(candidate)


if __name__ == "__main__":
    try:
        execute(os.environ.get("XP_RELEASE_MODE", ""), Path(sys.argv[1]))
    except Exception as error:
        print(f"STOP_NO_RETRY: {xp.safe_error_detail(error)}", file=sys.stderr)
        sys.exit(1)
