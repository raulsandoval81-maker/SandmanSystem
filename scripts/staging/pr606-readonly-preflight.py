"""Capture PR #606 staging rollback evidence. Cloud operations are reads only."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import zipfile

PROJECT = "sandman-combat-staging"
REGION = "us-central1"
SITE = f"sites/{PROJECT}"
SHA = "dd46b0466e739ac7871a0613f2cda1c17a31ca26"
TARGET = "/intake-management/management.intake.js"
ASSET_SHA = "9b2fe1df706bbba1ad13bfe8cd37e13ee137b1c8f7c692f6290bf57bd61d10e2"
FUNCTIONS = {"sendEnrollmentIntakeEmail": 1, "sendProposalPrepaidCashReceipt": 2,
             "recordManualEnrollmentIntakeDelivery": 1}
PROJECT_NUMBER = "991554514268"
RUNTIME = f"sandman-billing-runtime@{PROJECT}.iam.gserviceaccount.com"
REPO = "raulsandoval81-maker/SandmanSystem"
WORKFLOW = f"{REPO}/.github/workflows/staging-exact-sha-release.yml@refs/heads/main"
LIMIT = 32 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def guard(env):
    expected = {"GITHUB_REPOSITORY": REPO, "GITHUB_REF": "refs/heads/main",
                "GITHUB_WORKFLOW_REF": WORKFLOW, "CONFIRM_PROJECT": PROJECT,
                "CONFIRM_SHA": SHA, "REQUESTED_ACTION": "pr606-readonly-preflight"}
    for key, value in expected.items():
        require(env.get(key) == value, f"Unexpected {key}")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def command(operation, args, env=None):
    result = subprocess.run(args, capture_output=True, timeout=45, check=False, env=env)
    if result.returncode:
        stderr = result.stderr.decode(errors="replace")
        reason = next((code for code in ("PERMISSION_DENIED", "NOT_FOUND", "UNAUTHENTICATED")
                       if code in stderr.upper()), f"exit {result.returncode}")
        raise RuntimeError(f"{operation}: {reason}")
    return result.stdout


def hosting_access_token(env):
    credentials = env.get("HOSTING_CREDENTIALS_FILE")
    require(credentials and Path(credentials).is_file(), "Dedicated Hosting credentials unavailable")
    token = command("Acquire existing Hosting inventory token", ["gcloud", "auth", "print-access-token"],
                    env={**env, "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE": credentials,
                         "GOOGLE_APPLICATION_CREDENTIALS": credentials}).decode().strip()
    require(bool(token), "Empty Hosting inventory token")
    return token


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read(operation, url, token=None, signed_url_request=None, gen2_functions=("sendProposalPrepaidCashReceipt",)):
    # Signed source URL generation is the only non-GET API call.
    data = None
    if signed_url_request is not None:
        prefix = "https://cloudfunctions.googleapis.com/"
        allowed = {f"{prefix}v1/projects/{PROJECT}/locations/{REGION}/functions/{name}:generateDownloadUrl"
                   for name, generation in FUNCTIONS.items() if generation == 1}
        allowed.update(f"{prefix}v2alpha/projects/{PROJECT}/locations/{REGION}/functions/{name}:generateDownloadUrl"
                       for name in gen2_functions)
        require(url in allowed, "Unexpected source URL operation")
        data = b"" if signed_url_request == {} else json.dumps(signed_url_request).encode()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if data:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
            body = response.read(LIMIT + 1)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{operation}: HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError(f"{operation}: connection failed") from None
    require(len(body) <= LIMIT, f"{operation}: response too large")
    return body


def redact(value):
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, dict):
        return {key: ({"keys": sorted(item), "sha256": sha(json.dumps(item, sort_keys=True).encode())}
                      if key == "environmentVariables" and isinstance(item, dict)
                      else {"sha256": sha(str(item).encode())} if key == "value"
                      else redact(item)) for key, item in value.items()
                if key not in {"sourceUploadUrl", "sourceDownloadUrl", "downloadUrl", "uploadUrl"}}
    return value


def signed_source(name, api, payload, token, gen2_functions=("sendProposalPrepaidCashReceipt",)):
    endpoint = f"https://cloudfunctions.googleapis.com/{api}/projects/{PROJECT}/locations/{REGION}/functions/{name}:generateDownloadUrl"
    result = json.loads(read(f"{name} {api} generateDownloadUrl", endpoint, token, payload, gen2_functions))
    url = result.get("downloadUrl", "")
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and parsed.port in (None, 443) and not parsed.username
            and (parsed.hostname == "storage.googleapis.com" or
                 (parsed.hostname or "").endswith(".storage.googleapis.com")), "Unexpected signed source host")
    return read(f"{name} signed archive download", url)


def source_archive(name, generation, record, token):
    if generation == 1:
        version = str(record.get("versionId", ""))
        require(version.isdigit(), f"{name}: missing Gen1 version ID")
        return signed_source(name, "v1", {"versionId": version}, token), {
            "function": f"projects/{PROJECT}/locations/{REGION}/functions/{name}",
            "versionId": version,
        }

    storage = record.get("buildConfig", {}).get("sourceProvenance", {}).get("resolvedStorageSource", {})
    bucket, obj, version = (str(storage.get(k, "")) for k in ("bucket", "object", "generation"))
    require(bucket == "gcf-v2-sources-991554514268-us-central1"
            and obj == f"{name}/function-source.zip" and version.isdigit(), f"{name}: immutable Gen2 source generation missing")
    escaped = urllib.parse.quote(obj, safe="")
    url = f"https://storage.googleapis.com/storage/v1/b/{urllib.parse.quote(bucket, safe='')}/o/{escaped}?alt=media&generation={version}"
    reference = {"bucket": bucket, "object": obj, "generation": version}
    operation = f"{name} storage.objects.get for pinned generation"
    try:
        return read(operation, url, token), reference
    except RuntimeError as exc:
        if str(exc) != f"{operation}: HTTP 403":
            raise
        # This API returns the current deployed source. The caller compares the
        # whole function description again before accepting the recovery evidence.
        try:
            archive = signed_source(name, "v2alpha", {}, token)
        except RuntimeError as fallback:
            raise RuntimeError(f"{exc}; signed fallback: {fallback}") from None
        return archive, {**reference, "retrievedVia": "v2alpha.generateDownloadUrl",
                         "directObjectRead": "HTTP 403"}



def archive_evidence(archive):
    require(zipfile.is_zipfile(io.BytesIO(archive)), "Source archive is not a ZIP")
    with zipfile.ZipFile(io.BytesIO(archive)) as package:
        require(bool(package.namelist()), "Source archive is empty")
        require(not any(Path(name).name.startswith(".env") or Path(name).name.endswith((".pem", ".key"))
                        for name in package.namelist()), "Source archive contains a credential-like file")
    return {"sha256": sha(archive), "bytes": len(archive)}


def stripe_test_key(payload):
    require(bool(re.fullmatch(rb"(?:sk|rk)_test_[A-Za-z0-9_]+", payload)),
            "Existing Stripe credential does not have a verified test-mode key format")



def stripe_attachment(runtime):
    entries = [item for item in runtime.get("secretEnvironmentVariables", [])
               if item.get("key") == "STRIPE_SECRET_KEY"]
    if not entries:
        return {"status": "MISSING"}
    valid = len(entries) == 1 and entries[0].get("secret") == "STRIPE_SECRET_KEY" \
        and str(entries[0].get("projectId")) in (PROJECT, PROJECT_NUMBER) \
        and entries[0].get("version") == "latest"
    return {"status": "VERIFIED" if valid else "MISMATCH",
            "attachments": [{key: item.get(key) for key in ("key", "secret", "projectId", "version")}
                            for item in entries]}

def hosting(get, candidate):
    base = f"https://firebasehosting.googleapis.com/v1beta1/{SITE}"
    def active():
        releases = get("Hosting active release", base + "/releases?pageSize=1").get("releases", [])
        require(len(releases) == 1, "Active Hosting release missing")
        release, version = releases[0].get("name", ""), releases[0].get("version", {}).get("name", "")
        require(re.fullmatch(rf"{SITE}/releases/[0-9]+", release)
                and re.fullmatch(rf"{SITE}/versions/[\w-]+", version), "Unexpected Hosting baseline")
        return release, version
    release, version = active()
    version_url = "https://firebasehosting.googleapis.com/v1beta1/" + version
    config = get("Hosting version configuration", version_url)
    require(config.get("status") == "FINALIZED" and isinstance(config.get("config"), dict),
            "Hosting version is not finalized or configuration is unavailable")
    manifest, tokens, cursor = {}, set(), ""
    while True:
        query = urllib.parse.urlencode({"pageSize": 1000, **({"pageToken": cursor} if cursor else {})})
        page = get("Hosting manifest page", version_url + "/files?" + query)
        require(isinstance(page.get("files"), list), "Malformed Hosting manifest page")
        for file in page["files"]:
            path, digest = file.get("path", ""), file.get("hash", "")
            require(path.startswith("/") and path not in manifest and file.get("status") == "ACTIVE"
                    and re.fullmatch(r"[a-f0-9]{64}", digest), "Invalid or duplicate Hosting entry")
            manifest[path] = digest
        cursor = page.get("nextPageToken")
        if not cursor:
            break
        require(cursor not in tokens, "Repeated Hosting pagination token")
        tokens.add(cursor)
    require(TARGET in manifest, "Approved Hosting path is absent")
    # Firebase Hosting hashes the gzipped upload. Match the existing protected Node overlay.
    gzipped = subprocess.run(["node", "-e", "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0),{mtime:0}))"],
                             input=candidate, capture_output=True, check=True, timeout=15).stdout
    proposed = {**manifest, TARGET: sha(gzipped)}
    require([path for path in manifest if manifest[path] != proposed[path]] == [TARGET],
            "Proposed overlay does not change exactly the approved asset")
    require(active() == (release, version), "Hosting release changed during inventory")
    return {"release": release, "version": version, "rollbackVersion": version, "config": config["config"],
            "manifest": manifest, "proposed": proposed, "candidateSha256": ASSET_SHA}


def main():
    guard(os.environ)
    root = Path("evidence/pr606")
    root.mkdir(parents=True, exist_ok=True)
    result = {"status": "BLOCKED", "candidate": SHA, "functions": {}, "asset": TARGET}
    def save(name, value):
        (root / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    try:
        actual = command("Verify candidate checkout", ["git", "-C", "candidate", "rev-parse", "HEAD"]).decode().strip()
        require(actual == SHA, "Candidate checkout SHA mismatch")
        asset = Path("candidate/public" + TARGET).read_bytes()
        require(sha(asset) == ASSET_SHA, "Candidate asset SHA-256 mismatch")
        source = Path("candidate/functions/src/enrollment/sendEnrollmentIntakeEmail.ts").read_text()
        require(re.search(r"secrets:\s*\[RESEND_API_KEY,\s*STAGING_TEST_EMAIL_ALLOWLIST,\s*STRIPE_SECRET_KEY\]", source),
                "Candidate Intake must declare the existing Stripe secret")
        result["candidateStripeAttachment"] = "DECLARED"

        token = command("Acquire existing staging deployer token", ["gcloud", "auth", "print-access-token"]).decode().strip()
        require(bool(token), "Empty staging deployer token")
        def get(operation, url):
            return json.loads(read(operation, url, token))
        for name, generation in FUNCTIONS.items():
            resource = f"projects/{PROJECT}/locations/{REGION}/functions/{name}"
            endpoint = f"https://cloudfunctions.googleapis.com/v{generation}/{resource}"
            record = get(f"{name} describe", endpoint)
            require(record.get("status" if generation == 1 else "state") == "ACTIVE", f"{name}: not ACTIVE")
            runtime = record if generation == 1 else record.get("serviceConfig", {})
            if name == "sendEnrollmentIntakeEmail":
                require(runtime.get("serviceAccountEmail") == RUNTIME, "Intake runtime identity changed")
                result["stripeAttachment"] = stripe_attachment(runtime)
            policies = {"functions": get(f"{name} Functions IAM policy", endpoint + ":getIamPolicy")}
            if generation == 2:
                service = runtime.get("service", "")
                require(re.fullmatch(rf"projects/{PROJECT}/locations/{REGION}/services/[a-z0-9-]+", service),
                        f"{name}: unexpected Cloud Run resource")
                run = "https://run.googleapis.com/v2/" + service
                policies["run"] = get(f"{name} Cloud Run service", run)
                policies["runIam"] = get(f"{name} Cloud Run IAM policy", run + ":getIamPolicy")
            save(f"{name}-configuration.json", redact({"function": record, "transport": policies}))
            archive, recovery = source_archive(name, generation, record, token)
            result["functions"][name] = {**archive_evidence(archive), "recovery": recovery}
            del archive
            require(get(f"{name} recheck configuration", endpoint) == record, f"{name}: configuration changed during capture")

        hosting_token = hosting_access_token(os.environ)
        save("hosting.json", hosting(
            lambda operation, url: json.loads(read(operation, url, hosting_token)), asset))
        result["hostingIdentity"] = f"sandman-staging-deployer@{PROJECT}.iam.gserviceaccount.com"
        runtime_token = command("Impersonate billing runtime (iam.serviceAccounts.getAccessToken)",
                                ["gcloud", "auth", "print-access-token", f"--impersonate-service-account={RUNTIME}"]).decode().strip()
        require(bool(runtime_token), "Empty billing runtime impersonation token")
        secret = json.loads(read("Runtime Stripe secret access (secretmanager.versions.access)",
                                 f"https://secretmanager.googleapis.com/v1/projects/{PROJECT}/secrets/STRIPE_SECRET_KEY/versions/latest:access",
                                 runtime_token))
        stripe_test_key(base64.b64decode(secret["payload"]["data"], validate=True))
        result["stripeCredential"] = {"runtime": RUNTIME, "effectiveAccess": True, "testKeyFormat": True}
        require(result["stripeAttachment"]["status"] == "VERIFIED",
                "Intake deployed Stripe attachment is missing or mismatched; a separately reviewed release must attach the existing secret")
        result["status"] = "PASS"
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.SubprocessError) as exc:
        result["blocker"] = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
    save("summary.json", result)
    print(json.dumps(result))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
