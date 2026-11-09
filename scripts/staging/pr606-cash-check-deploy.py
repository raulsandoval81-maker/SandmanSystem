"""Source-only function updates and one Hosting overlay for merged PR #606."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("pr606_inventory", HERE / "pr606-readonly-preflight.py")
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)

ACTION = "pr606-staging-cash-check-deploy"
CONTINUE_ACTION = "pr606-staging-cash-check-continue"
CONTINUE_APPROVAL = "APPROVE_PR606_STAGING_CASH_CHECK_CONTINUATION"
MANUAL = "recordManualEnrollmentIntakeDelivery"
RECEIPT = "sendProposalPrepaidCashReceipt"
APPROVAL = "APPROVE_PR606_STAGING_CASH_CHECK_RELEASE"
SHA = "bf043dfc50b72def1ea6202e6a3cbba3fa252c20"
ASSET_SHA = "e293ff8d4bdbaccb2c61acbb6f46b1dd60a87693e06251a78fc767bd78013ae0"
PROJECT, REGION, SITE = inventory.PROJECT, inventory.REGION, inventory.SITE
TARGET, FUNCTIONS = inventory.TARGET, inventory.FUNCTIONS
require = inventory.require
FUNCTION_API = "https://cloudfunctions.googleapis.com/"
HOSTING_API = "https://firebasehosting.googleapis.com/v1beta1/"
BASELINE = json.loads((HERE / "pr606-cash-check-baseline.json").read_text())


def guard(env):
    action = env.get("REQUESTED_ACTION")
    require(action in (ACTION, CONTINUE_ACTION), "Unexpected REQUESTED_ACTION")
    expected = {
        "GITHUB_REPOSITORY": inventory.REPO, "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW, "REQUESTED_ACTION": action,
        "CONFIRM_PROJECT": PROJECT, "CONFIRM_SHA": SHA, "DEPLOY_APPROVAL": CONTINUE_APPROVAL if action == CONTINUE_ACTION else APPROVAL,
        "EXPECTED_HOSTING_RELEASE": BASELINE["hosting"]["release"],
        "EXPECTED_HOSTING_VERSION": BASELINE["hosting"]["version"],
    }
    for key, value in expected.items():
        require(env.get(key) == value, f"Unexpected {key}")


def fingerprint(value):
    return inventory.sha(json.dumps(value, sort_keys=True).encode())


def get(operation, url, token):
    return json.loads(inventory.read(operation, url, token))


def write(operation, url, method, payload, token=None, content_type="application/json",
          gen1_upload=False):
    body = json.dumps(payload).encode() if content_type == "application/json" else payload
    headers = {"Content-Type": content_type}
    if token:
        headers["Authorization"] = "Bearer " + token
    if gen1_upload:
        headers["x-goog-content-length-range"] = "0,104857600"
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.build_opener(inventory.NoRedirect()).open(request, timeout=90) as response:
            return json.load(response) if content_type == "application/json" else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{operation}: HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError(f"{operation}: outcome unknown") from None


def endpoint(name):
    return FUNCTION_API + f"v{FUNCTIONS[name]}/projects/{PROJECT}/locations/{REGION}/functions/{name}"


def function_config(name, token):
    url = endpoint(name)
    record = get(name + " describe", url, token)
    generation = FUNCTIONS[name]
    require(record.get("status" if generation == 1 else "state") == "ACTIVE", f"{name}: not ACTIVE")
    policies = {"functions": get(name + " IAM", url + ":getIamPolicy", token)}
    if generation == 2:
        service = record["serviceConfig"]["service"]
        require(service == f"projects/{PROJECT}/locations/{REGION}/services/{name.lower()}",
                "Unexpected Cloud Run service")
        run = "https://run.googleapis.com/v2/" + service
        policies["run"] = get(name + " Run service", run, token)
        policies["runIam"] = get(name + " Run IAM", run + ":getIamPolicy", token)
    return {"function": record, "transport": policies}


def runtime_config(config):
    """Ignore source/revision bookkeeping only. Retain IAM and invocation settings."""
    record = dict(config["function"])
    transport = dict(config["transport"])
    for key in ("updateTime", "versionId", "buildId", "buildName", "sourceArchiveUrl", "sourceUploadUrl",
                "sourceRepository"):
        record.pop(key, None)
    if "buildConfig" in record:
        record["buildConfig"] = {key: value for key, value in record["buildConfig"].items()
                                 if key not in {"source", "sourceProvenance", "build"}}
        record["serviceConfig"] = dict(record["serviceConfig"])
        record["serviceConfig"].pop("revision", None)
        service = dict(transport["run"])
        for key in ("conditions", "terminalCondition"):
            if key in service:
                def condition(value):
                    return {k: v for k, v in value.items() if k != "lastTransitionTime"}
                service[key] = ([condition(value) for value in service[key]] if key == "conditions"
                                else condition(service[key]))
        service["buildConfig"] = {k: v for k, v in service["buildConfig"].items()
                                  if k not in {"name", "sourceLocation"}}
        annotations = dict(service.get("annotations", {}))
        if annotations.get("cloudfunctions.googleapis.com/function-id") == RECEIPT:
            annotations.pop("cloudfunctions.googleapis.com/function-id")
        service["annotations"] = annotations
        for key in ("etag", "generation", "observedGeneration", "updateTime", "lastModifier",
                    "latestCreatedRevision", "latestReadyRevision"):
            service.pop(key, None)
        service["template"] = dict(service["template"])
        template = service["template"]
        template.pop("revision", None)
        if template.get("client") in {"cloudfunctions", "cloud-console"}:
            template.pop("client")
        labels = dict(template.get("labels", {}))
        for key, expected in {"goog-drz-cloudfunctions-id": RECEIPT.lower(),
                              "goog-drz-cloudfunctions-location": REGION}.items():
            if labels.get(key) == expected:
                labels.pop(key)
        template["labels"] = labels
        service["template"]["containers"] = [
            {key: value for key, value in container.items() if key != "image"}
            for container in service["template"]["containers"]
        ]
        service["trafficStatuses"] = [
            {key: value for key, value in traffic.items() if key != "revision" or
             traffic.get("type") != "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"}
            for traffic in service.get("trafficStatuses", [])
        ]
        transport["run"] = service
    return {"function": record, "transport": transport}


def source_update(name, archive, token):
    generation = FUNCTIONS[name]
    url = endpoint(name)
    upload = write(name + " generate upload URL", url.rsplit("/", 1)[0] + ":generateUploadUrl",
                   "POST", {}, token)
    upload_url = upload["uploadUrl"]
    parsed = urllib.parse.urlsplit(upload_url)
    require(parsed.scheme == "https" and parsed.port in (None, 443) and not parsed.username
            and (parsed.hostname == "storage.googleapis.com" or
                 (parsed.hostname or "").endswith(".storage.googleapis.com")), "Unexpected upload host")
    write(name + " upload source", upload_url, "PUT", archive, content_type="application/zip",
          gen1_upload=generation == 1)
    field = "sourceUploadUrl" if generation == 1 else "buildConfig.source.storageSource"
    payload = ({"sourceUploadUrl": upload_url} if generation == 1 else
               {"buildConfig": {"source": {"storageSource": upload["storageSource"]}}})
    payload["name"] = url.split("/", 4)[-1]
    operation = write(name + " update source", url + "?" + urllib.parse.urlencode({"updateMask": field}),
                      "PATCH", payload, token)
    operation_name = operation.get("name", "")
    require(re.fullmatch(r"operations/[\w./-]+|projects/[\w-]+/locations/us-central1/operations/[\w-]+",
                         operation_name), "Unexpected function operation")
    for _ in range(150):
        if operation.get("done"):
            require(not operation.get("error"), f"{name}: source update failed")
            return
        time.sleep(5)
        operation = get(name + " poll update", FUNCTION_API + f"v{generation}/" + operation_name, token)
    raise RuntimeError(f"{name}: source update timed out; inspect operation before any retry")


def hosting_inventory(asset, token):
    return inventory.hosting(lambda operation, url: get(operation, url, token), asset)


def verify_hosting_baseline(hosting):
    approved = BASELINE["hosting"]
    require(all(hosting[key] == approved[key] for key in ("release", "version"))
            and fingerprint({key: hosting[key] for key in ("config", "manifest")}) == approved["fingerprint"],
            "Hosting differs from approved baseline")


def prepare_hosting(hosting, asset, token):
    zipped = subprocess.run(["node", "-e",
                             "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0),{mtime:0}))"],
                            input=asset, capture_output=True, check=True).stdout
    digest = inventory.sha(zipped)
    proposed = hosting["proposed"]
    require(proposed == {**hosting["manifest"], TARGET: digest}
            and hosting["manifest"][TARGET] != digest, "Unexpected Hosting scope")
    version = write("Create Hosting version", HOSTING_API + SITE + "/versions", "POST",
                    {"config": hosting["config"]}, token)["name"]
    require(re.fullmatch(rf"{SITE}/versions/[\w-]+", version) and version != hosting["version"],
            "Unexpected Hosting version")
    entries = list(proposed.items())
    for start in range(0, len(entries), 900):
        batch = write("Populate Hosting version", HOSTING_API + version + ":populateFiles", "POST",
                      {"files": dict(entries[start:start + 900])}, token)
        for requested in batch.get("uploadRequiredHashes", []):
            upload = "https://upload-firebasehosting.googleapis.com/upload/" + version + "/files"
            require(requested == digest and batch["uploadUrl"] == upload, "Unexpected Hosting upload")
            write("Upload approved Hosting asset", upload + "/" + digest, "POST", zipped, token,
                  "application/octet-stream")
    write("Finalize Hosting version", HOSTING_API + version + "?update_mask=status", "PATCH",
          {"status": "FINALIZED"}, token)
    return version


def verify_version(version, config, manifest, token):
    result = get("Read finalized Hosting version", HOSTING_API + version, token)
    require(result["status"] == "FINALIZED" and result["config"] == config,
            "Hosting configuration changed")
    found, seen = {}, set()
    cursor = ""
    while True:
        query = urllib.parse.urlencode({"pageSize": 1000, **({"pageToken": cursor} if cursor else {})})
        page = get("Read finalized Hosting manifest", HOSTING_API + version + "/files?" + query, token)
        for entry in page["files"]:
            path = entry["path"]
            require(path not in found and entry["status"] == "ACTIVE", "Invalid Hosting manifest entry")
            found[path] = entry["hash"]
        cursor = page.get("nextPageToken")
        if not cursor:
            break
        require(cursor not in seen, "Repeated Hosting pagination token")
        seen.add(cursor)
    require(found == manifest, "Finalized Hosting manifest differs")


def archive_contents(data):
    import io
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = [item.filename for item in archive.infolist() if not item.is_dir()]
        require(len(set(names)) == len(names), "Duplicate archive paths")
        return {name: inventory.sha(archive.read(name)) for name in names}


def deployed_source(name, config, token):
    if FUNCTIONS[name] == 2:
        return inventory.signed_source(name, "v2alpha", {}, token)
    return inventory.source_archive(name, 1, config["function"], token)[0]


def verify_receipt_traffic(config):
    run = config["transport"]["run"]
    name = RECEIPT.lower() + "-00003-taq"
    expected = {"percent": 100, "type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"}
    require(run["traffic"] == [expected] and run["trafficStatuses"] == [{**expected, "revision": name}]
            and run["latestReadyRevision"] == run["name"] + "/revisions/" + name
            and run["latestCreatedRevision"] == run["latestReadyRevision"]
            and run["terminalCondition"]["state"] == "CONDITION_SUCCEEDED"
            and config["function"]["serviceConfig"]["revision"] == name,
            "Receipt no longer serves the approved healthy revision at 100%")
    return run["name"] + "/revisions/" + RECEIPT.lower() + "-00002-8v7"


def main():
    guard(os.environ)
    continuation = os.environ["REQUESTED_ACTION"] == CONTINUE_ACTION
    actual = subprocess.check_output(["git", "-C", "candidate", "rev-parse", "HEAD"], text=True).strip()
    require(actual == SHA, "Candidate checkout SHA mismatch")
    asset = Path("candidate/public" + TARGET).read_bytes()
    require(inventory.sha(asset) == ASSET_SHA, "Candidate Hosting asset SHA-256 mismatch")
    source = Path("candidate/functions/src/enrollment/sendEnrollmentIntakeEmail.ts").read_text()
    require("STRIPE_SECRET_KEY" not in source and re.search(
        r"secrets:\s*\[RESEND_API_KEY,\s*STAGING_TEST_EMAIL_ALLOWLIST\]", source),
        "Unexpected candidate Intake secret configuration")
    archive = Path(os.environ["CANDIDATE_PACKAGE"]).read_bytes()
    inventory.archive_evidence(archive)
    token = inventory.command("Acquire function credentials", ["gcloud", "auth", "print-access-token"]).decode().strip()
    require(bool(token), "Empty Functions token")
    hosting_token = inventory.hosting_access_token(os.environ)
    hosting = hosting_inventory(asset, hosting_token)
    verify_hosting_baseline(hosting)
    configs = {}
    with tempfile.TemporaryDirectory(prefix="pr606-rollback-") as recovery_dir:
        for name, generation in FUNCTIONS.items():
            config = function_config(name, token)
            if continuation:
                snapshot = BASELINE["continuation"]["functions"][name]
                require(fingerprint(inventory.redact(config)) == snapshot["fingerprint"],
                        f"{name}: configuration or transport differs from Run #340")
                if name != MANUAL:
                    deployed = deployed_source(name, config, token)
                    require(inventory.sha(deployed) == snapshot["sha256"]
                            and archive_contents(deployed) == archive_contents(archive),
                            f"{name}: deployed source does not match reviewed candidate")
                    if name == RECEIPT:
                        revision = verify_receipt_traffic(config)
                        prior = get("Verify original receipt revision", "https://run.googleapis.com/v2/" + revision, token)
                        require(prior.get("name") == revision and prior.get("containers"),
                                "Original receipt revision unavailable")
                    configs[name] = config
                    continue
            approved = BASELINE["functions"][name]
            require(fingerprint(inventory.redact(config)) == approved["fingerprint"],
                    f"{name}: configuration or transport differs from approved baseline")
            old, reference = inventory.source_archive(name, generation, config["function"], token)
            require(inventory.archive_evidence(old)["sha256"] == approved["sha256"]
                    and reference.items() >= {key: value for key, value in approved["recovery"].items()
                                              if key not in {"retrievedVia", "directObjectRead"}}.items(),
                    f"{name}: approved source recovery unavailable")
            (Path(recovery_dir) / (name + ".zip")).write_bytes(old)
            if generation == 2:
                service = config["transport"]["run"]
                revision = service["latestReadyRevision"]
                require(re.fullmatch(re.escape(service["name"]) + r"/revisions/[a-z0-9-]+", revision),
                        "Unexpected rollback Cloud Run revision")
                prior = get("Verify prior receipt revision is retained",
                            "https://run.googleapis.com/v2/" + revision, token)
                require(prior.get("name") == revision and prior.get("containers"),
                        "Receipt Cloud Run rollback revision unavailable")
                print(f"Receipt rollback revision: {revision}", flush=True)
            configs[name] = config
        require(hosting_inventory(asset, hosting_token) == hosting, "Hosting changed before deployment")
        for name, config in configs.items():
            require(function_config(name, token) == config, f"{name}: changed before deployment")
        version = (BASELINE["continuation"]["version"] if continuation
                   else prepare_hosting(hosting, asset, hosting_token))
        verify_version(version, hosting["config"], hosting["proposed"], hosting_token)
        updated = []
        try:
            verified = dict(configs)
            for name, config in configs.items():
                if continuation and name != MANUAL:
                    continue
                require(function_config(name, token) == config, f"{name}: changed before update")
                print(f"Updating source for {name}", flush=True)
                updated.append(name)
                source_update(name, archive, token)
                after = function_config(name, token)
                require(runtime_config(after) == runtime_config(config), f"{name}: runtime or transport changed")
                deployed_archive = deployed_source(name, after, token)
                verified[name] = after
                require(inventory.sha(deployed_archive) == inventory.sha(archive), f"{name}: deployed source differs")
            for name, config in verified.items():
                require(function_config(name, token) == config, f"{name}: changed before Hosting publish")
            require(hosting_inventory(asset, hosting_token) == hosting, "Hosting changed before publish")
            verify_version(version, hosting["config"], hosting["proposed"], hosting_token)
            query = urllib.parse.urlencode({"versionName": version})
            release = write("Publish Hosting overlay", HOSTING_API + SITE + "/releases?" + query, "POST", {},
                            hosting_token)["name"]
            latest = get("Verify live Hosting release", HOSTING_API + SITE + "/releases?pageSize=1", hosting_token)
            require(latest["releases"][0]["name"] == release
                    and latest["releases"][0]["version"]["name"] == version, "Hosting release not active")
            verify_version(version, hosting["config"], hosting["proposed"], hosting_token)
            live = inventory.read("Read live Hosting asset", f"https://{PROJECT}.web.app{TARGET}?" +
                                  urllib.parse.urlencode({"release": release}))
            require(inventory.sha(live) == ASSET_SHA, "Live Hosting asset hash differs")
        except Exception:
            print(f"STOP: reconcile attempted functions {updated}, Hosting version {version}, "
                  f"and run #{BASELINE['run']} before any retry.", flush=True)
            raise
    print(json.dumps({"applicationSha": SHA, "functions": list(FUNCTIONS), "asset": TARGET,
                      "assetSha256": ASSET_SHA, "release": release, "version": version,
                      "rollback": BASELINE["hosting"]["version"]}))


ENTRY_POINTS = {
    "sendEnrollmentIntakeEmail": "lib/enrollment/sendEnrollmentIntakeEmail.js",
    "sendProposalPrepaidCashReceipt": "lib/billing/sendProposalPrepaidCashReceipt.js",
    "recordManualEnrollmentIntakeDelivery": "lib/enrollment/recordManualEnrollmentIntakeDelivery.js",
}


def package():
    guard(os.environ)
    root = Path("candidate/functions")
    require(set(ENTRY_POINTS) == set(FUNCTIONS), "Unexpected callable exports")
    index = 'require("firebase-admin").initializeApp();\n'
    for name, path in ENTRY_POINTS.items():
        index += f'exports.{name} = require("./{path}").{name};\n'
    metadata = json.loads((root / "package.json").read_text())
    metadata["main"] = "index.js"
    metadata.pop("scripts", None)
    pending = list(ENTRY_POINTS.values())
    included = set()
    with zipfile.ZipFile(os.environ["CANDIDATE_PACKAGE"], "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("index.js", index)
        archive.writestr("package.json", json.dumps(metadata))
        archive.write(root / "package-lock.json", "package-lock.json")
        archive.writestr("APPLICATION_SHA", SHA + "\n")
        while pending:
            path = pending.pop()
            if path in included:
                continue
            included.add(path)
            source = (root / path).read_text()
            archive.write(root / path, path)
            for dependency in re.findall(r"""require\(["'](\.[^"']+)["']\)""", source):
                resolved = (root / path).parent / dependency
                options = [resolved, Path(str(resolved) + ".js"), Path(str(resolved) + ".json"),
                           resolved / "index.js"]
                local = next((option.resolve() for option in options if option.is_file()), None)
                require(local is not None and local.is_relative_to((root / "lib").resolve()),
                        f"Cannot package dependency {dependency} from {path}")
                pending.append(local.relative_to(root.resolve()).as_posix())
    with tempfile.TemporaryDirectory() as directory:
        with zipfile.ZipFile(os.environ["CANDIDATE_PACKAGE"]) as archive:
            archive.extractall(directory)
        subprocess.run(["node", "-e",
                        "const e=require(process.argv[1]);"
                        "if(JSON.stringify(Object.keys(e).sort())!==process.argv[2]||"
                        "Object.values(e).some(f=>typeof f!==\"function\"))process.exit(1);",
                        directory, json.dumps(sorted(FUNCTIONS), separators=(",", ":"))],
                       env={**os.environ, "NODE_PATH": str((root / "node_modules").resolve())}, check=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["--guard-only"]:
        guard(os.environ)
    elif sys.argv[1:] == ["--package"]:
        package()
    else:
        require(not sys.argv[1:], "Unexpected release argument")
        main()
