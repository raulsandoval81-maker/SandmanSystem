"""Read-only source-overlay and rollback verification for PR #731."""
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import zipfile

import receipt_intake_inventory as inventory

REPOSITORY = "raulsandoval81-maker/SandmanSystem"
SHA = "eb3db00a5940b71b55e2d0024db7fb125fa5bbbb"
TARGET = "createManagementXpAdjustment"
SHARED = "searchManagementMembers"
PROJECT = "sandmandashboard"
REGION = "us-central1"
LOCATION = f"projects/{PROJECT}/locations/{REGION}"
FUNCTION = f"https://cloudfunctions.googleapis.com/v2/{LOCATION}/functions/{TARGET}"
SERVICE = f"https://run.googleapis.com/v2/{LOCATION}/services/{TARGET.lower()}"
BUCKET = f"gcf-v2-sources-{inventory.NUMBER}-{REGION}"
OVERLAY = {
    "lib/management/managementXpTools.js": (
        "011fb62d8b74782315118ddaeed0799544459ee8bf25abc229db3a4f21701fb4",
        "715d2ae2828dc8c53d953289de4ab3c49b1fe8ad6938d36aae92b5934c67456e",
    ),
    "lib/services/authoritativeXpService.js": (
        "ce363c13485f9232cabd2528272559bd33005ab0d51aa9ccb7e9b9c8f81634c8",
        "08dea67eb31ddda852bd70fb5a8b08b509a9e58c040a38311394a59aeace35e7",
    ),
}
require = inventory.require
sha = inventory.sha


def digest(record):
    return sha(json.dumps(record, sort_keys=True, separators=(",", ":")).encode())


def source_ref(record):
    source = record.get("sourceProvenance", {}).get("resolvedStorageSource", {})
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


def manifest(archive):
    result = {}
    with zipfile.ZipFile(io.BytesIO(archive)) as source:
        infos = source.infolist()
        require(sum(info.file_size for info in infos) <= 128 * 1024 * 1024,
                "Source expands beyond the preflight limit")
        paths = set()
        for info in infos:
            path = info.filename.rstrip("/")
            require(path and not any(part in ("", ".", "..") for part in path.split("/"))
                    and "\\" not in path and path not in paths
                    and (info.external_attr >> 16) & 0o170000 in (0, 0o040000, 0o100000),
                    "Unsupported or duplicate source archive entry")
            paths.add(path)
            if not info.is_dir():
                result[path] = sha(source.read(info))
    return result


def make_overlay(archive, candidate, expected=OVERLAY):
    original = manifest(archive)
    require({"package.json", "package-lock.json", "lib/index.js"} <= original.keys(),
            "Missing lockfile or entry point in rollback archive")
    replacements = {}
    for path, (baseline_hash, candidate_hash) in expected.items():
        require(original.get(path) == baseline_hash, f"Unapproved baseline bytes: {path}")
        data = (candidate / path).read_bytes()
        require(sha(data) == candidate_hash, f"Unapproved candidate bytes: {path}")
        replacements[path] = data

    result = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(archive)) as source, zipfile.ZipFile(result, "w") as output:
        for info in source.infolist():
            data = source.read(info)
            output.writestr(info, replacements.get(info.filename, data))
    result = result.getvalue()
    expected_manifest = {**original, **{path: sha(data) for path, data in replacements.items()}}
    require(manifest(result) == expected_manifest, "Unexpected archive entry changes")
    return result


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
    return json.loads(subprocess.check_output(
        ["gcloud", "builds", "describe", match[2], "--project", PROJECT,
         "--region", match[1], "--format=json"], stderr=subprocess.DEVNULL,
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
        "revision": revision,
        "servingRepository": repository,
        "servingDigest": digest_value,
        "functionBuild": resource,
        "functionBuildStatus": build.get("status"),
        "reportedImageCount": len(results),
        "repositoryMatched": any(image_repository(item.get("name", "")) == repository for item in results),
        "digestMatched": any(item.get("digest") == digest_value for item in results),
    }, sort_keys=True), flush=True)
    raise RuntimeError("Function build does not prove provenance of the serving image")


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


def preflight(candidate):
    require(git_head(candidate) == SHA, "Wrong application commit")
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
            and os.environ.get("GITHUB_REF") == "refs/heads/main"
            and os.environ.get("GITHUB_WORKFLOW_REF") ==
            f"{REPOSITORY}/.github/workflows/management-xp-readonly-preflight.yml@refs/heads/main"
            and os.environ.get("CONFIRM_TARGET") == f"{PROJECT}/{REGION}/{TARGET}",
            "Outside approved read-only workflow scope")

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
    image_record = json.loads(subprocess.check_output(
        ["gcloud", "run", "revisions", "describe", revision, "--project", PROJECT,
         "--region", REGION, "--format=json"], stderr=subprocess.DEVNULL,
    ))
    image = image_record.get("status", {}).get("imageDigest", "")
    require(image_record.get("metadata", {}).get("name") == revision
            and len(rev.get("containers", [])) == 1
            and re.fullmatch(r"[^@]+@sha256:[0-9a-f]{64}", image),
            "Serving revision is missing an immutable image digest")
    build_resource = config.get("build", "")
    build = build_record(build_resource)
    verify_build_image(build, build_resource, image, revision)

    function_source = source_ref(config)
    serving_source = source_ref(build)
    rollback = read_archive(function_source, token)
    if serving_source != function_source:
        require(manifest(read_archive(serving_source, token)) == manifest(rollback),
                "Shared image was built from different source bytes")
    candidate_functions = candidate / "functions"
    rollback_manifest = manifest(rollback)
    dependencies = inventory.closure(candidate_functions, "management/managementXpTools")
    for path in ("package.json", "package-lock.json"):
        dependencies[path] = sha((candidate_functions / path).read_bytes())
    for path, expected_hash in sorted(dependencies.items()):
        if path not in OVERLAY:
            require(rollback_manifest.get(path) == expected_hash,
                    f"Unapproved dependency drift: {path}")
    archive = make_overlay(rollback, candidate_functions)
    with zipfile.ZipFile(io.BytesIO(rollback)) as source:
        index = source.read("lib/index.js")
    require(b"createManagementXpAdjustment" in index and b"managementXpTools" in index,
            "Rollback archive is missing the target entry point")
    with zipfile.ZipFile(io.BytesIO(rollback)) as source:
        scripts = json.loads(source.read("package.json")).get("scripts", {})
    build_environment = config.get("environmentVariables", {})
    explicit_build_scripts = build_environment.get("GOOGLE_NODE_RUN_SCRIPTS")
    rebuild_expected = (
        bool(explicit_build_scripts) if explicit_build_scripts is not None
        else bool(scripts.get("gcp-build", scripts.get("build")))
    )
    require(read_archive(function_source, token) == rollback,
            "Generation-pinned rollback bytes failed recovery verification")
    require(snapshot() == baseline
            and get("https://run.googleapis.com/v2/" + revision_prefix + revision) == rev,
            "Production configuration drifted during capture")
    print(json.dumps({
        "status": "SOURCE_OVERLAY_VERIFIED_RELEASE_BLOCKED",
        "candidateCommit": SHA,
        "target": TARGET,
        "revision": revision,
        "image": image,
        "build": config["build"],
        "sharedImageRepositoryNaming": SHARED.lower() in image.lower(),
        "servingSource": serving_source,
        "rollbackSource": function_source,
        "rollbackSha256": sha(rollback),
        "rollbackManifestSha256": digest(rollback_manifest),
        "dependencyManifestSha256": digest(dependencies),
        "overlayArchiveSha256": sha(archive),
        "overlayPaths": sorted(OVERLAY),
        "buildScriptsMayRegenerateOverlay": rebuild_expected,
        "baselineSha256": digest({**baseline, "revision": rev}),
        "baselineComponentSha256": {
            name: digest(value) for name, value in {**baseline, "revision": rev}.items()
        },
        "durableRollbackRetentionVerified": False,
        "deploymentEnabled": False,
    }, sort_keys=True))


if __name__ == "__main__":
    try:
        preflight(Path(sys.argv[1]))
    except (RuntimeError, KeyError, OSError, ValueError, zipfile.BadZipFile,
            subprocess.CalledProcessError) as error:
        detail = str(error) if type(error) is RuntimeError else type(error).__name__
        print(f"STOP_NO_RETRY: {detail}", file=sys.stderr)
        sys.exit(1)
