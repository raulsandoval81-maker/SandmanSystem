"""Release the reviewed paid Intake path using source-only Function updates."""
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.parse
import zipfile

import receipt_intake_inventory as inventory

# Reuse the source-only patch, LRO handling, and finalized Hosting verifier.
import importlib
release = importlib.import_module("pr606-cash-check-deploy")

PLAN = json.loads(Path(__file__).with_suffix(".json").read_text())
PROJECT, SITE = inventory.PROJECT, inventory.SITE
HOSTING = release.HOSTING_API
REGION = "us-central1"
NAMES = PLAN["functionOrder"]
release.PROJECT, release.SITE = PROJECT, SITE
release.FUNCTIONS = {name: generation for name, (generation, _) in inventory.FUNCTIONS.items()}
require = inventory.require


def digest(value):
    return inventory.sha(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def archive_hashes(archive):
    with zipfile.ZipFile(io.BytesIO(archive)) as package:
        names = [item.filename for item in package.infolist() if not item.is_dir()]
        require(len(names) == len(set(names)), "Duplicate archive paths")
        return {name: inventory.sha(package.read(name)) for name in names}


def config(name, token):
    result = release.function_config(name, token)
    transport = result["transport"]
    return {"function": result["function"], "iam": transport["functions"],
            **{key: transport[key] for key in ("run", "runIam") if key in transport}}


def runtime(name, snapshot):
    release.RECEIPT = name
    return release.runtime_config({"function": snapshot["function"],
        "transport": {"functions": snapshot["iam"],
                      **{key: snapshot[key] for key in ("run", "runIam") if key in snapshot}}})


def source(name, snapshot, token, version=None):
    generation = release.FUNCTIONS[name]
    api = "v1" if generation == 1 else "v2alpha"
    payload = {"versionId": str(version or snapshot["function"]["versionId"])} if generation == 1 else {}
    url = release.endpoint(name).replace(f"/v{generation}/", f"/{api}/")
    signed = json.loads(inventory.request(url + ":generateDownloadUrl", token, payload))["downloadUrl"]
    return inventory.request(signed, None, signed=True)


def pinned_recovery(name, snapshot, token):
    expected = PLAN["functions"][name]
    reference = expected["reference"]
    if release.FUNCTIONS[name] == 1:
        archive = source(name, snapshot, token, reference["versionId"])
    else:
        bucket = reference["bucket"]
        object_name = urllib.parse.quote(reference["object"], safe="")
        query = urllib.parse.urlencode({"alt": "media", "generation": reference["generation"]})
        archive = inventory.request(
            f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/{object_name}?{query}", token)
    require(digest(archive_hashes(archive)) == expected["recoveryFilesSha256"],
            f"{name}: pinned rollback bytes differ")
    return archive


def capture_recovery(snapshots, token, report_all=False):
    recovery = {}
    failed = []
    for name in NAMES:
        try:
            archive = pinned_recovery(name, snapshots[name], token)
            require(config(name, token) == snapshots[name], f"{name}: recovery capture raced a release")
        except RuntimeError as error:
            if not report_all:
                raise
            failed.append(name)
            print(f"Rollback source check failed for {name}: {error}", flush=True)
        else:
            recovery[name] = archive
            print(f"Verified pinned rollback source for {name}", flush=True)
    require(not failed, "Pinned rollback source checks failed: " + ", ".join(failed))
    return recovery


def rollback(token, packages):
    verify_rules(token)
    baseline = PLAN["hosting"]
    version = get(HOSTING + baseline["version"], token)
    manifest = inventory.manifest(lambda url: get(url, token), baseline["version"])
    require(version["status"] == "FINALIZED" and digest(version["config"]) == baseline["configSha256"]
            and digest(manifest) == baseline["manifestSha256"], "Rollback Hosting baseline differs")
    _, live_version = active(token)
    if live_version != baseline["version"]:
        overlay = {**manifest, **{path: value["hostingHash"] for path, value in baseline["assets"].items()}}
        release.verify_version(live_version, version["config"], overlay, token)
    targets = {}
    for name in NAMES:
        snapshot = config(name, token)
        expected = PLAN["functions"][name]
        require(digest(runtime(name, inventory.sanitize(snapshot))) == expected["runtimeSha256"],
                f"{name}: runtime changed since inventory")
        live = archive_hashes(source(name, snapshot, token))
        if digest(live) == expected["recoveryFilesSha256"]:
            continue
        require(live == archive_hashes(packages[name]), f"{name}: unknown live source")
        targets[name] = (snapshot, pinned_recovery(name, snapshot, token))
    require(active(token)[1] == live_version, "Hosting changed during rollback preflight")
    if live_version != baseline["version"]:
        publish(baseline["version"], token)
    for name in reversed(NAMES):
        if name not in targets:
            continue
        snapshot, archive = targets[name]
        require(config(name, token) == snapshot, f"{name}: drift before rollback")
        release.source_update(name, archive, token)
        restored = config(name, token)
        require(runtime(name, restored) == runtime(name, snapshot)
                and archive_hashes(source(name, restored, token)) == archive_hashes(archive),
                f"{name}: rollback verification failed")
        print(f"Restored {name}")


def package(name, root):
    entry = inventory.FUNCTIONS[name][1]
    closure = inventory.closure(root, entry)
    require(digest(closure) == PLAN["functions"][name]["candidateClosureSha256"],
            f"{name}: compiled closure differs from inventory")
    metadata = json.loads((root / "package.json").read_text())
    metadata["main"] = "index.js"
    metadata.pop("scripts", None)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("index.js", 'require("firebase-admin").initializeApp();\n'
                         f'exports.{name} = require("./lib/{entry}").{name};\n')
        archive.writestr("package.json", json.dumps(metadata))
        archive.write(root / "package-lock.json", "package-lock.json")
        for path in sorted(closure):
            archive.write(root / path, path)
    return output.getvalue()


def check_export(name, archive, root):
    with tempfile.TemporaryDirectory() as directory:
        with zipfile.ZipFile(io.BytesIO(archive)) as package:
            package.extractall(directory)
        subprocess.run(
            ["node", "-e",
             "const e=require(process.argv[1]);const n=process.argv[2];"
             "if(Object.keys(e).join()!==n||typeof e[n]!=='function')process.exit(1)",
             directory, name],
            env={**os.environ, "NODE_PATH": str((root / "node_modules").resolve())},
            check=True,
        )


def assets(root):
    hosting = PLAN["hosting"]
    ui_root = root.parent / "staging-ui"
    ui_sha = subprocess.check_output(["git", "-C", str(ui_root), "rev-parse", "HEAD"], text=True).strip()
    require(ui_sha == hosting["uiCandidate"], "Staging UI checkout SHA differs")
    core_root = root.parent / "staging-core"
    core_sha = subprocess.check_output(["git", "-C", str(core_root), "rev-parse", "HEAD"], text=True).strip()
    require(core_sha == hosting["coreCandidate"], "Staging Core checkout SHA differs")
    result = {}
    for path, expected in PLAN["hosting"]["assets"].items():
        asset_root = ui_root if path in hosting["uiPaths"] else core_root if path in hosting["corePaths"] else root
        raw = (asset_root / ("public" + path)).read_bytes()
        require(inventory.sha(raw) == expected["candidateSha256"], f"{path}: source differs")
        zipped = subprocess.run(
            ["node", "-e", "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0)))"],
            input=raw, capture_output=True, check=True).stdout
        require(inventory.sha(zipped) == expected["hostingHash"], f"{path}: gzip differs")
        result[path] = zipped
    return result


def get(url, token):
    return json.loads(inventory.request(url, token))


def active(token):
    releases = get(HOSTING + SITE + "/releases?pageSize=1", token)["releases"]
    require(len(releases) == 1, "No unique active Hosting release")
    return releases[0]["name"], releases[0]["version"]["name"]


def hosting_baseline(token):
    expected = PLAN["hosting"]
    require(active(token) == (expected["release"], expected["version"]), "Hosting baseline drift")
    version = get(HOSTING + expected["version"], token)
    manifest = inventory.manifest(lambda url: get(url, token), expected["version"])
    require(version["status"] == "FINALIZED" and digest(version["config"]) == expected["configSha256"]
            and digest(manifest) == expected["manifestSha256"], "Hosting configuration or manifest drift")
    return version["config"], manifest


def verify_rules(token):
    api = "https://firebaserules.googleapis.com/v1/"
    active_rules = get(api + f"projects/{PROJECT}/releases/cloud.firestore", token)
    ruleset = get(api + active_rules["rulesetName"], token)
    snapshot = {"release": active_rules, "rollback": ruleset,
                "candidateSha256": inventory.sha(Path("application/firestore.rules").read_bytes())}
    require(digest(snapshot) == PLAN["rulesSha256"], "Rules baseline drift")


def prepare_hosting(configuration, manifest, payloads, token):
    version = release.write("Create overlay", HOSTING + SITE + "/versions", "POST",
                            {"config": configuration}, token)["name"]
    require(version.startswith(SITE + "/versions/") and version.count("/") == 3,
            "Unexpected Hosting version")
    entries = list(manifest.items())
    for offset in range(0, len(entries), 900):
        response = release.write("Populate overlay", HOSTING + version + ":populateFiles", "POST",
                                 {"files": dict(entries[offset:offset + 900])}, token)
        for key in response.get("uploadRequiredHashes", []):
            url = "https://upload-firebasehosting.googleapis.com/upload/" + version + "/files"
            require(key in payloads and response["uploadUrl"] == url, "Unexpected Hosting upload")
            release.write("Upload overlay asset", url + "/" + key, "POST", payloads[key], token,
                          "application/octet-stream")
    release.write("Finalize overlay", HOSTING + version + "?update_mask=status",
                  "PATCH", {"status": "FINALIZED"}, token)
    release.verify_version(version, configuration, manifest, token)
    return version


def publish(version, token):
    query = urllib.parse.urlencode({"versionName": version})
    receipt = release.write("Publish Hosting", HOSTING + SITE + "/releases?" + query,
                            "POST", {}, token)
    require(active(token) == (receipt["name"], version), "Hosting publication could not be verified")


def preflight(token):
    required = [
        "cloudfunctions.functions.get", "cloudfunctions.functions.update",
        "cloudfunctions.functions.sourceCodeGet", "cloudfunctions.functions.sourceCodeSet",
        "firebasehosting.sites.get", "firebasehosting.sites.update",
        "firebaserules.releases.get", "firebaserules.rulesets.get",
        "run.services.get", "run.services.getIamPolicy",
    ]
    url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions"
    granted = json.loads(inventory.request(url, token, {"permissions": required}))
    require(set(required) <= set(granted.get("permissions", [])), "Production release permissions drift")
    snapshots = {}
    for name, expected in PLAN["functions"].items():
        snapshot = config(name, token)
        require(digest(inventory.sanitize(snapshot)) == expected["configurationSha256"],
                f"{name}: Function configuration, revision or IAM drift")
        snapshots[name] = snapshot
    for name in PLAN["pendingCoreFunctionBaseline"]:
        release.FUNCTIONS[name] = 2
        snapshot = config(name, token)
        evidence = inventory.source(name, 2, snapshot["function"], token)
        require(config(name, token) == snapshot, f"{name}: configuration changed during inventory")
        candidate = inventory.closure(Path("staging-core/functions"), f"proposals/{name}")
        print(json.dumps({"coreDependency": name,
                          "configurationSha256": digest(inventory.sanitize(snapshot)),
                          "runtimeSha256": digest(runtime(name, inventory.sanitize(snapshot))),
                          "reference": evidence["reference"],
                          "recoveryFilesSha256": digest(evidence["files"]),
                          "archiveSha256": evidence["archiveSha256"],
                          "candidateClosure": candidate,
                          "liveClosure": {path: value for path, value in evidence["files"].items()
                                          if path in candidate}}, sort_keys=True), flush=True)
    hosting = hosting_baseline(token)
    verify_rules(token)
    return snapshots, hosting


def guard(mode):
    repo = "raulsandoval81-maker/SandmanSystem"
    expected = {"GITHUB_REPOSITORY": repo, "GITHUB_REF": "refs/heads/main",
                "GITHUB_WORKFLOW_REF": f"{repo}/.github/workflows/production-receipt-intake-release.yml@refs/heads/main",
                "CONFIRM_PROJECT": PROJECT, "CONFIRM_SHA": PLAN["candidate"]}
    for key, value in expected.items():
        require(os.environ.get(key) == value, f"Release guard: {key}")
    require(mode in {"preflight", "deploy", "rollback"}, "Unsupported mode")
    if mode == "rollback":
        require(os.environ.get("CONFIRM_RELEASE") == "ROLLBACK-RECEIPT-INTAKE-42924733167",
                "Rollback confirmation missing")
    if mode == "deploy":
        require(os.environ.get("CONFIRM_RELEASE") == "DEPLOY-RECEIPT-INTAKE-42924733167",
                "Release confirmation missing")
        require(all(isinstance(value, str) and value.startswith("https://")
                    for value in PLAN["stagingAcceptance"].values()),
                "Reviewed synthetic staging evidence is missing")
        require(not PLAN["pendingCoreFunctionBaseline"],
                "Core Function baseline and compatibility review is pending")


def authenticated_release_token(env=None):
    """Validate the Actions credential-file identity without using gcloud's account store."""
    env = os.environ if env is None else env
    credential_file = (env.get("CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE")
                       or env.get("GOOGLE_APPLICATION_CREDENTIALS"))
    require(bool(credential_file), "Production credential-file override missing")
    try:
        credentials = json.loads(Path(credential_file).read_text())
    except (OSError, ValueError):
        raise RuntimeError("Production credential file unavailable or invalid") from None
    require(isinstance(credentials, dict)
            and credentials.get("type") == "service_account"
            and credentials.get("project_id") == PROJECT
            and credentials.get("client_email")
            == "github-action-1258739245@sandmandashboard.iam.gserviceaccount.com",
            "Unexpected production release credential identity")
    print("Production release credential identity verified", flush=True)
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    require(bool(token), "Production access token unavailable")
    return token


def main():
    mode = os.environ["RELEASE_MODE"]
    guard(mode)
    root = Path("application")
    sha = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    require(sha == PLAN["candidate"], "Application checkout SHA differs")
    packages = {name: package(name, root / "functions") for name in NAMES}
    overlay = assets(root)
    token = authenticated_release_token()
    if mode == "rollback":
        rollback(token, packages)
        return
    snapshots, (configuration, manifest) = preflight(token)
    recovery = capture_recovery(snapshots, token, report_all=(mode == "preflight"))
    proposed = dict(manifest)
    payloads = {}
    for path, body in overlay.items():
        require(manifest.get(path) == PLAN["hosting"]["assets"][path]["baselineHash"],
                f"{path}: asset baseline drift")
        proposed[path] = inventory.sha(body)
        payloads[proposed[path]] = body
    if mode == "preflight":
        print("Baseline, source packages, and recovery bytes verified")
        return

    # Stage the full Hosting manifest before switching any traffic.
    version = prepare_hosting(configuration, proposed, payloads, token)
    completed = []
    in_flight = None
    try:
        preflight(token)
        for name in NAMES:
            require(config(name, token) == snapshots[name], f"{name}: drift before source update")
            in_flight = name
            release.source_update(name, packages[name], token)
            after = config(name, token)
            require(runtime(name, after) == runtime(name, snapshots[name]), f"{name}: runtime or IAM changed")
            require(archive_hashes(source(name, after, token)) == archive_hashes(packages[name]),
                    f"{name}: live source differs")
            completed.append((name, after))
            in_flight = None
            print(f"Verified {name}")
        verify_rules(token)
        for name in set(snapshots) - set(NAMES):
            require(config(name, token) == snapshots[name], f"{name}: excluded dependency changed")
        hosting_baseline(token)
        in_flight = "Hosting"
        publish(version, token)
        release.verify_version(version, configuration, proposed, token)
        in_flight = None
        print(f"Verified release {version}")
    except Exception:
        # Unknown write outcome must be investigated before replaying it.
        print(f"Release stopped. Unverified write: {in_flight or 'none'}")
        if in_flight is None:
            for name, after in reversed(completed):
                require(config(name, token) == after, f"{name}: drift before rollback")
                release.source_update(name, recovery[name], token)
                restored = config(name, token)
                require(runtime(name, restored) == runtime(name, snapshots[name])
                        and archive_hashes(source(name, restored, token)) == archive_hashes(recovery[name]),
                        f"{name}: rollback verification failed")
                print(f"Restored {name}")
        raise


if __name__ == "__main__":
    main()
