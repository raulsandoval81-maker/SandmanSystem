"""Read-only source-overlay and rollback verification for PR #731."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import receipt_intake_inventory as inventory
import management_xp_recovery_candidate as recovery

REPOSITORY = "raulsandoval81-maker/SandmanSystem"
SHA = recovery.COMMIT
CANDIDATE_SHA256 = "790511d05711c4dbd304c2c08e942a480e1f1b5f42435915bf78092a123bf346"
MANIFEST_SHA256 = "1eebe9ccab48a228d268f3ef6f28346906313fae450fdc9d6be17721b972982c"
MANIFEST = Path(__file__).resolve().parents[2] / "docs/releases/management-xp-recovery-candidate.json"
TARGET = "createManagementXpAdjustment"
SHARED = "searchManagementMembers"
PROJECT = "sandmandashboard"
REGION = "us-central1"
LOCATION = f"projects/{PROJECT}/locations/{REGION}"
FUNCTION = f"https://cloudfunctions.googleapis.com/v2/{LOCATION}/functions/{TARGET}"
SERVICE = f"https://run.googleapis.com/v2/{LOCATION}/services/{TARGET.lower()}"
BUCKET = f"gcf-v2-sources-{inventory.NUMBER}-{REGION}"
ORIGINAL_SOURCE = {
    "bucket": BUCKET,
    "object": f"{TARGET}/function-source.zip",
    "generation": "1791403805929116",
}
SANITIZED_CONFIG = {
    "bucket": recovery.BASELINE["bucket"],
    "object": "xp-recovery/production-config-sanitized.json",
    "generation": "1795226241121217",
    "sha256": "fbe65cbca739edfa054e3e45643373550f8bb673a4ba3b61671d2f09666b579d",
}
# One-time historical gap. Never used for new deployment provenance.
RELEASE_WORKFLOW = "management-xp-production-release.yml"
HISTORICAL_REVISION = "createmanagementxpadjustment-00019-hut"
HISTORICAL_IMAGE = (
    "us-central1-docker.pkg.dev/sandmandashboard/gcf-artifacts/"
    "sandmandashboard__us--central1__search_management_members"
    "@sha256:65b30bda41751b565c9aa9fdcc95da6f4d444022e2e0b9167901b63bbb93d675"
)
HISTORICAL_BUILD = (
    "projects/889326401061/locations/us-central1/builds/"
    "f96b1ce1-7758-4647-8b5a-6c6a5c4c0a68"
)
HISTORICAL_BUILD_SOURCE = {
    "bucket": BUCKET,
    "object": f"{SHARED}/function-source.zip",
    "generation": "1791403756604186",
}
HISTORICAL_EXCEPTION_ACK = "ACKNOWLEDGE_PINNED_OLD_IMAGE_AND_BUILD_SOURCE_PROVENANCE_GAPS"

require = inventory.require
sha = inventory.sha


def digest(record):
    return sha(json.dumps(record, sort_keys=True, separators=(",", ":")).encode())


def source_ref(record):
    """Read an immutable GCS source from either supported Google Cloud API shape.

    Cloud Functions buildConfig and Cloud Build may populate different fields.
    Never infer a source from the function name or historical build metadata.
    """
    resolved = (record.get("sourceProvenance") or {}).get("resolvedStorageSource") or {}
    configured = (record.get("source") or {}).get("storageSource") or {}
    require(resolved or configured, "UNVERIFIED: source has no storage reference")
    if resolved and configured:
        require(all(str(resolved.get(key, "")) == str(configured.get(key, ""))
                    for key in ("bucket", "object", "generation")),
                "CONFLICTING: source storage references differ")
    source = resolved or configured
    require(source.get("bucket") == BUCKET
            and source.get("object") in {f"{name}/function-source.zip" for name in (TARGET, SHARED)}
            and re.fullmatch(r"[1-9][0-9]*", str(source.get("generation", ""))),
            "Missing approved, generation-pinned storage source identity")
    return {key: str(source[key]) for key in ("bucket", "object", "generation")}


def read_archive(ref, token):
    path = urllib.parse.quote(ref["object"], safe="")
    return inventory.request(
        f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/{path}"
        f"?alt=media&generation={ref['generation']}", token,
    )


def guarded_gcloud(stage, command):
    """Expose a fixed operation label and exit code, never command arguments or output."""
    try:
        return subprocess.check_output(command, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            f"UNVERIFIED: {stage} failed (exit code {error.returncode})"
        ) from None


def read_retained(ref, token):
    require(ref in (recovery.BASELINE, SANITIZED_CONFIG), "Unexpected recovery object")
    require(bool(token), "Refusing an unauthenticated recovery object read")
    label = "sanitized configuration" if ref == SANITIZED_CONFIG else "rollback ZIP"
    path = urllib.parse.quote(ref["object"], safe="")
    url = (f"https://storage.googleapis.com/storage/v1/b/{ref['bucket']}/o/{path}"
           f"?alt=media&generation={ref['generation']}")
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    limit = 32 * 1024 * 1024
    try:
        with urllib.request.build_opener(inventory.NoRedirect()).open(request, timeout=45) as response:
            data = response.read(limit + 1)
    except urllib.error.HTTPError as error:
        detail = inventory.storage_error_detail(error)
        raise RuntimeError(
            f"UNVERIFIED: retained {label} generation {ref['generation']} read returned HTTP {error.code}{detail}"
        ) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError(f"UNVERIFIED: retained {label} read failed at transport") from None
    require(len(data) <= limit, "Retained recovery object exceeds size limit")
    require(sha(data) == ref["sha256"], "Retained recovery object hash mismatch")
    return data


def verified_candidate(archive, candidate, manifest_path=MANIFEST):
    raw = manifest_path.read_bytes()
    require(sha(raw) == MANIFEST_SHA256, "Merged candidate manifest hash mismatch")
    package, report = recovery.build(archive, {
        name: (candidate / "functions" / name).read_bytes() for name in recovery.PINNED
    })
    require(sha(package) == CANDIDATE_SHA256 and report == json.loads(raw),
            "Reconstructed candidate does not match the approved single-file manifest")
    return package, report


def verify_candidate(archive, candidate, manifest_path=MANIFEST):
    return verified_candidate(archive, candidate, manifest_path)[1]


def sanitized_configuration(fn):
    build, service = fn["buildConfig"], fn["serviceConfig"]
    fields = ("allTrafficOnLatestRevision", "availableCpu", "availableMemory",
              "ingressSettings", "maxInstanceCount", "maxInstanceRequestConcurrency",
              "minInstanceCount", "revision", "timeoutSeconds")
    return {
        "name": fn["name"],
        "state": fn["state"],
        "buildConfig": {
            "runtime": build.get("runtime"),
            "entryPoint": build.get("entryPoint"),
            "environmentVariableNames": sorted(build.get("environmentVariables") or {}),
        },
        "serviceConfig": {
            **{key: service.get(key) for key in fields},
            "environmentVariableNames": sorted(service.get("environmentVariables") or {}),
            "secretEnvironmentVariableCount": len(service.get("secretEnvironmentVariables") or []),
            "secretVolumeCount": len(service.get("secretVolumes") or []),
            "serviceAccountConfigured": bool(service.get("serviceAccountEmail")),
        },
    }


def verify_sanitized_configuration(fn, expected):
    # Revision is checked independently against the ready Cloud Run revision and 100% traffic.
    # Historical revision changes must not be mistaken for security configuration drift.
    require(isinstance(expected, dict) and isinstance(expected.get("serviceConfig"), dict),
            "Invalid retained sanitized configuration")
    current_config = sanitized_configuration(fn)
    expected_config = json.loads(json.dumps(expected))
    current_config["serviceConfig"].pop("revision", None)
    expected_config["serviceConfig"].pop("revision", None)
    require(current_config == expected_config, "Production sanitized configuration drift")


def git_head(candidate):
    return subprocess.check_output(
        ["git", "-C", str(candidate), "rev-parse", "HEAD"], text=True,
    ).strip()


def build_record(resource):
    match = re.fullmatch(
        rf"projects/(?:{PROJECT}|{inventory.NUMBER})/locations/({REGION}|global)/builds/([a-f0-9-]+)",
        resource,
    )
    require(match, "Missing or out-of-scope Cloud Build resource")
    return json.loads(guarded_gcloud(
        "historical Cloud Build metadata read",
        ["gcloud", "builds", "describe", match[2], "--project", PROJECT,
         "--region", match[1], "--format=json"],
    ))


def image_repository(reference):
    """Remove OCI digest and tag while preserving the full registry and repository."""
    name = reference.split("@", 1)[0]
    leaf = name.rsplit("/", 1)[-1]
    return name.rsplit(":", 1)[0] if ":" in leaf else name


def verify_build_image(build, resource, image, revision):
    repository, digest_value = image.rsplit("@", 1)
    repository = image_repository(repository)
    results = build.get("results", {}).get("images", [])
    matches = [
        record for record in results
        if image_repository(record.get("name", "")) == repository
        and record.get("digest") == digest_value
        and ("@" not in record.get("name", "") or record["name"].split("@", 1)[1] == digest_value)
    ]
    if build.get("status") == "SUCCESS" and matches:
        return
    # Emit only selected control-plane fields. Never dump a build or its environment.
    print(json.dumps({
        "check": "serving-image-provenance",
        "status": "UNVERIFIED" if not results and build.get("status") == "SUCCESS" else "CONFLICTING",
        "revision": revision,
        "servingRepository": repository,
        "servingDigest": digest_value,
        "functionBuild": resource,
        "functionBuildStatus": build.get("status"),
        "reportedImageCount": len(results),
        "repositoryMatched": any(image_repository(item.get("name", "")) == repository for item in results),
        "digestMatched": any(item.get("digest") == digest_value for item in results),
    }, sort_keys=True), flush=True)
    status = "UNVERIFIED" if not results and build.get("status") == "SUCCESS" else "CONFLICTING"
    raise RuntimeError(f"{status}: Function build does not prove provenance of the serving image")


def verify_pinned_historical_exception(build, resource, image, revision, serving_source):
    """Release-only exception for old build/image AND build/source metadata gaps.

    The separately retained archives are verified in preflight, but do not prove
    what bytes the legacy build consumed. No unverified source is invented.
    New-image evidence requirements are not affected.
    """
    require(os.environ.get("HISTORICAL_PROVENANCE_ACK") == HISTORICAL_EXCEPTION_ACK,
            "Explicit historical image provenance exception approval missing")
    require(revision == HISTORICAL_REVISION and image == HISTORICAL_IMAGE
            and resource == HISTORICAL_BUILD, "Historical image identity drift")
    require(build.get("status") == "SUCCESS"
            and not build.get("results", {}).get("images", []),
            "Historical build has conflicting image evidence")
    require(serving_source is None or serving_source == HISTORICAL_BUILD_SOURCE,
            "Historical build source identity drift")
    print(json.dumps({
        "status": "HISTORICAL_BUILD_PROVENANCE_UNVERIFIED_EXCEPTION",
        "scope": "pre-update baseline only",
        "revision": revision,
        "build": resource,
        "buildSourcePointer": serving_source,
        "buildSourcePointerVerified": serving_source is not None,
        "buildImageLinkVerified": False,
        "image": image,
        "reason": "Old build lacks image digest and may lack source reference; both pinned archives separately match rollback",
    }, sort_keys=True), flush=True)


def verify_artifact_registry_provenance(build, resource, image, revision):
    """Require independent Google-managed build/subject linkage if Build.results.images is empty.

    This is not a substitute for source-byte, IAM or ready-revision checks.
    If Artifact Registry metadata lacks an exact match, fail closed.
    """
    require(build.get("status") == "SUCCESS", "New image producing build was not successful")
    match = re.fullmatch(
        rf"projects/(?:{PROJECT}|{inventory.NUMBER})/locations/({REGION}|global)/builds/([a-f0-9-]+)",
        resource,
    )
    require(match and re.fullmatch(r"[^@]+@sha256:[0-9a-f]{64}", image),
            "Unrecognized new build or image identity")
    report = json.loads(guarded_gcloud(
        "Artifact Registry image provenance read",
        ["gcloud", "artifacts", "docker", "images", "describe", image,
         "--show-provenance", "--project", PROJECT, "--format=json"],
    ))
    digest_value = image.split("@sha256:", 1)[1]
    summary = report.get("image_summary", {})
    require(summary.get("fully_qualified_digest") == image
            and summary.get("digest") == "sha256:" + digest_value,
            "Artifact Registry provenance image identity mismatch")
    allowed_invocations = {
        f"https://cloudbuild.googleapis.com/v1/projects/{project}/locations/{match[1]}/builds/{match[2]}"
        for project in (PROJECT, inventory.NUMBER)
    }
    image_name = image.split("@", 1)[0]
    for item in (report.get("provenance_summary") or {}).get("provenance", []):
        statement = item.get("build", {}).get("inTotoSlsaProvenanceV1", {})
        if statement.get("predicateType") != "https://slsa.dev/provenance/v1":
            continue
        metadata = statement.get("predicate", {}).get("runDetails", {}).get("metadata", {})
        subjects = statement.get("subject", [])
        signed = item.get("envelope", {}).get("signatures", [])
        if (metadata.get("invocationId") in allowed_invocations and
                any(subject.get("digest", {}).get("sha256") == digest_value and
                    subject.get("name", "").removeprefix("https://").split(":", 1)[0] == image_name
                    for subject in subjects) and signed):
            print(json.dumps({
                "status": "GOOGLE_MANAGED_ARTIFACT_PROVENANCE_MATCH",
                "revision": revision, "build": resource, "image": image,
                "signatureValidatedLocally": False,
            }, sort_keys=True), flush=True)
            return
    raise RuntimeError("UNVERIFIED: Artifact Registry metadata does not link serving image to new build")


def access_token():
    """Use only the credentials file exported by the guarded auth action."""
    credentials = os.environ.get("CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE")
    require(credentials and Path(credentials).is_file(),
            "Protected Google Cloud credentials file is missing")
    try:
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token", "--quiet", "--project", PROJECT],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        raise RuntimeError("Could not obtain a Google Cloud access token from the protected credentials") from None
    require(token and not any(char.isspace() for char in token),
            "Protected Google Cloud authentication returned no usable access token")
    return token


def authenticated_get(url, token):
    require(bool(token), "Refusing an unauthenticated production metadata request")
    try:
        return json.loads(inventory.request(url, token))
    except RuntimeError as error:
        if str(error).endswith(": HTTP 401"):
            raise RuntimeError("Google Cloud rejected the protected access token (HTTP 401)") from None
        if str(error).endswith(": HTTP 403"):
            raise RuntimeError("Protected identity lacks access to the requested metadata (HTTP 403)") from None
        raise


def require_workflow_scope(workflow="management-xp-readonly-preflight.yml"):
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
            and os.environ.get("GITHUB_REF") == "refs/heads/main"
            and os.environ.get("GITHUB_WORKFLOW_REF") ==
            f"{REPOSITORY}/.github/workflows/{workflow}@refs/heads/main"
            and os.environ.get("CONFIRM_TARGET") == f"{PROJECT}/{REGION}/{TARGET}",
            "Outside approved read-only workflow scope")

def recovery_storage_access():
    require_workflow_scope()
    token = access_token()
    credentials_path = Path(os.environ["CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE"])
    credentials = json.loads(credentials_path.read_text())
    email = credentials.get("client_email")
    require(credentials.get("type") == "service_account" and isinstance(email, str)
            and re.fullmatch(r"[a-z0-9._-]+@[a-z0-9.-]+\.gserviceaccount\.com", email),
            "Protected credentials do not identify a service account")
    print(json.dumps({"authenticatedServiceAccount": email}), flush=True)
    denied = False
    for label, ref in (("sanitized configuration", SANITIZED_CONFIG), ("rollback ZIP", recovery.BASELINE)):
        try:
            read_retained(ref, token)
        except RuntimeError as error:
            if f"generation {ref['generation']} read returned HTTP 403" not in str(error):
                raise
            print(str(error), flush=True)
            denied = True
        else:
            print(json.dumps({"verified": label, "generation": ref["generation"]}), flush=True)
    require(not denied, "UNVERIFIED: one or more pinned recovery reads returned HTTP 403")


def preflight(candidate, workflow="management-xp-readonly-preflight.yml"):
    require(git_head(candidate) == SHA, "Wrong application commit")
    require_workflow_scope(workflow)
    token = access_token()

    def get(url):
        return authenticated_get(url, token)

    def snapshot():
        return {key: get(url) for key, url in {
            "function": FUNCTION,
            "functionIam": FUNCTION + ":getIamPolicy?options.requestedPolicyVersion=3",
            "run": SERVICE,
            "runIam": SERVICE + ":getIamPolicy?options.requestedPolicyVersion=3",
        }.items()}

    baseline = snapshot()
    fn, run = baseline["function"], baseline["run"]
    config = fn["buildConfig"]
    revision = fn["serviceConfig"]["revision"]
    revision_prefix = f"{LOCATION}/services/{TARGET.lower()}/revisions/"
    require(re.fullmatch(rf"{TARGET.lower()}-[0-9]+-[a-z0-9]+", revision)
            and fn["name"] == f"{LOCATION}/functions/{TARGET}"
            and fn.get("state") == "ACTIVE" and fn.get("environment") == "GEN_2"
            and config.get("runtime") == "nodejs22" and config.get("entryPoint") == TARGET
            and run.get("latestReadyRevision", "").split("/")[-1] == revision
            and run.get("terminalCondition", {}).get("state") == "CONDITION_SUCCEEDED"
            and not run.get("reconciling")
            and fn["serviceConfig"].get("serviceAccountEmail")
            == run["template"].get("serviceAccount")
            and bool(run["template"].get("serviceAccount")),
            "Function runtime, identity or readiness does not match the service")
    traffic = run.get("trafficStatuses", [])
    require(len(traffic) == 1 and traffic[0].get("percent") == 100
            and traffic[0].get("revision", "").split("/")[-1] == revision,
            "Unexpected serving traffic")
    rev = get("https://run.googleapis.com/v2/" + revision_prefix + revision)
    image_record = json.loads(guarded_gcloud(
        "serving Cloud Run revision metadata read",
        ["gcloud", "run", "revisions", "describe", revision, "--project", PROJECT,
         "--region", REGION, "--format=json"],
    ))
    image = image_record.get("status", {}).get("imageDigest", "")
    require(image_record.get("metadata", {}).get("name") == revision
            and len(rev.get("containers", [])) == 1
            and re.fullmatch(r"[^@]+@sha256:[0-9a-f]{64}", image),
            "Serving revision is missing an immutable image digest")
    expected = json.loads(read_retained(SANITIZED_CONFIG, token))
    verify_sanitized_configuration(fn, expected)
    function_source = source_ref(config)
    require(function_source == ORIGINAL_SOURCE, "Production Function source identity drift")
    rollback = read_retained(recovery.BASELINE, token)
    require(read_archive(function_source, token) == rollback,
            "Retained rollback differs from the generation-pinned original")
    package, report = verified_candidate(rollback, candidate)
    print(json.dumps({
        "status": "SINGLE_FILE_CANDIDATE_VERIFIED",
        "candidateSha256": report["candidateSha256"],
        "changedEntries": report["changedEntries"],
        "rollbackSource": recovery.BASELINE,
        "deploymentEnabled": False,
    }, sort_keys=True), flush=True)

    build_resource = config.get("build", "")
    require(build_resource, "UNVERIFIED: Function does not identify a producing build")
    try:
        build = build_record(build_resource)
    except RuntimeError as error:
        raise RuntimeError(f"{error}") from None
    # The pinned old Cloud Build record can omit both source fields and
    # results.images. Waive that *historical* metadata gap only after the
    # owner's new explicit acknowledgment and byte-checking BOTH known archives.
    is_legacy_exception = (
        workflow == RELEASE_WORKFLOW and not build.get("results", {}).get("images", [])
    )
    if is_legacy_exception:
        require(os.environ.get("HISTORICAL_PROVENANCE_ACK") == HISTORICAL_EXCEPTION_ACK,
                "Explicit historical image and build-source provenance approval missing")
        require(build_resource == HISTORICAL_BUILD and revision == HISTORICAL_REVISION
                and image == HISTORICAL_IMAGE and build.get("status") == "SUCCESS",
                "Historical build identity drift")
        require(read_archive(HISTORICAL_BUILD_SOURCE, token) == rollback,
                "CONFLICTING: independent pinned historical source archive does not match rollback")
        resolved = (build.get("sourceProvenance") or {}).get("resolvedStorageSource")
        configured = (build.get("source") or {}).get("storageSource")
        serving_source = source_ref(build) if (resolved or configured) else None
        if serving_source is not None:
            require(read_archive(serving_source, token) == rollback,
                    "CONFLICTING: historical build-reported source archive differs")
        verify_pinned_historical_exception(
            build, build_resource, image, revision, serving_source)
    else:
        serving_source = source_ref(build)
        if serving_source != function_source:
            require(read_archive(serving_source, token) == rollback,
                    "CONFLICTING: serving build source differs from original")
        verify_build_image(build, build_resource, image, revision)
    require(snapshot() == baseline
            and get("https://run.googleapis.com/v2/" + revision_prefix + revision) == rev,
            "Production configuration drifted during capture")
    print(json.dumps({
        "status": ("PROTECTED_RELEASE_BASELINE_GUARDS_PASSED"
                   if workflow == RELEASE_WORKFLOW else "READ_ONLY_VERIFIED_RELEASE_BLOCKED"),
        "candidateSha256": report["candidateSha256"],
        "target": TARGET,
        "revision": revision,
        "image": image,
        "build": build_resource,
        "servingSource": serving_source,
        "rollbackSource": recovery.BASELINE,
        "baselineComponentSha256": {
            name: digest(value) for name, value in {**baseline, "revision": rev}.items()
        },
        "deploymentEnabled": workflow == RELEASE_WORKFLOW,
        "historicalImageBuildLinkVerified": bool(build.get("results", {}).get("images", [])),
        "historicalBuildSourcePointerVerified": serving_source is not None,
    }, sort_keys=True))
    return token, snapshot, baseline, revision, image, package


def safe_error_detail(error):
    if isinstance(error, subprocess.CalledProcessError):
        # Arguments and output may contain tokens, file paths, or other private values.
        command = error.cmd
        executable = Path(str(command[0])).name if isinstance(command, (list, tuple)) and command else "unknown"
        operation = "gcloud read-only operation" if executable == "gcloud" else "local read-only subprocess"
        return f"UNVERIFIED: {operation} failed (exit code {error.returncode})"
    return str(error) if type(error) is RuntimeError else type(error).__name__


if __name__ == "__main__":
    try:
        check = os.environ.get("XP_READONLY_CHECK") or "preflight"
        require(check in ("preflight", "recovery-storage-access"), "Unknown read-only check")
        if check == "recovery-storage-access":
            recovery_storage_access()
        else:
            preflight(Path(sys.argv[1]))
    except (RuntimeError, KeyError, OSError, ValueError, zipfile.BadZipFile,
            subprocess.CalledProcessError) as error:
        detail = safe_error_detail(error)
        print(f"STOP_NO_RETRY: {detail}", file=sys.stderr)
        sys.exit(1)
