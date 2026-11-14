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
for core_name in ("saveProposalEnrollmentAgreement", "issueProposalEnrollmentHandoff"):
    inventory.FUNCTIONS[core_name] = (2, f"proposals/{core_name}")
    release.FUNCTIONS[core_name] = 2
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


def post_update_runtime(name, snapshot):
    """Compare protected settings independently of Cloud Run rollout diagnostics."""
    normalized = runtime(name, snapshot)
    run = normalized["transport"].get("run")
    if run is not None:
        run.pop("conditions", None)
        run.pop("terminalCondition", None)
        run.pop("reconciling", None)
        for target in run["trafficStatuses"]:
            target.pop("uri", None)
    return normalized


def verify_updated_runtime(name, before, after):
    run = after.get("run")
    if run is not None:
        require(not run.get("reconciling", False)
                and run.get("terminalCondition", {}).get("state") == "CONDITION_SUCCEEDED",
                f"{name}: Cloud Run rollout is not ready")
    require(post_update_runtime(name, after) == post_update_runtime(name, before),
            f"{name}: runtime or IAM changed")


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
    if PLAN["functions"][name].get("source") == "staging-core":
        root = root.parent.parent / "staging-core" / "functions"
        sha = subprocess.check_output(["git", "-C", str(root.parent), "rev-parse", "HEAD"], text=True).strip()
        require(sha == PLAN["hosting"]["coreCandidate"], "Staging Core checkout SHA differs")
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
    require(mode in {"preflight", "diagnose-release-10", "capture-restoration-evidence", "deploy", "rollback"}, "Unsupported mode")
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


def diagnose_release_10(token, candidate):
    """Read the pinned live source and compare protected fingerprints without writes."""
    name = "saveProposalEnrollmentAgreement"
    expected = PLAN["functions"][name]
    before = config(name, token)
    live = before["function"]["buildConfig"]["sourceProvenance"]["resolvedStorageSource"]
    generation = "1794629107340168"
    require(live["bucket"] == expected["reference"]["bucket"]
            and live["object"] == expected["reference"]["object"]
            and str(live["generation"]) == generation, "Release #10 live source changed")
    object_name = urllib.parse.quote(live["object"], safe="")
    query = urllib.parse.urlencode({"alt": "media", "generation": generation})
    archive = inventory.request(
        f"https://storage.googleapis.com/storage/v1/b/{live['bucket']}/o/{object_name}?{query}", token)
    rollback_archive = pinned_recovery(name, before, token)
    after = config(name, token)
    require(after == before, "Function changed during diagnostics")
    actual_files = archive_hashes(archive)
    candidate_files = archive_hashes(candidate)
    normalized = runtime(name, inventory.sanitize(before))
    actual_runtime = digest(normalized)
    result = {
        "function": name,
        "sourceGeneration": generation,
        "liveArchiveSha256": inventory.sha(archive),
        "candidateArchiveSha256": inventory.sha(candidate),
        "sourceFilesMatch": actual_files == candidate_files,
        "differentSourcePaths": sorted(path for path in actual_files.keys() | candidate_files.keys()
                                       if actual_files.get(path) != candidate_files.get(path)),
        "rollbackArchiveSha256": inventory.sha(rollback_archive),
        "expectedRuntimeSha256": expected["runtimeSha256"],
        "liveRuntimeSha256": actual_runtime,
        "runtimeMatches": actual_runtime == expected["runtimeSha256"],
    }
    print(json.dumps(result, sort_keys=True), flush=True)
    require(result["sourceFilesMatch"], "Release #10 live source differs from reviewed package")


def capture_restoration_evidence(token, candidate):
    """Capture redacted production evidence for the exact interrupted update."""
    name = "saveProposalEnrollmentAgreement"
    snapshot = config(name, token)
    run = snapshot["run"]
    revision = "saveproposalenrollmentagreement-00007-zuk"
    require(run.get("latestReadyRevision", "").endswith("/revisions/" + revision)
            and run.get("reconciling") is False
            and run.get("terminalCondition", {}).get("state") == "CONDITION_SUCCEEDED",
            "Expected Cloud Run revision is not ready")
    traffic = [target for target in run.get("trafficStatuses", []) if target.get("percent", 0)]
    require(len(traffic) == 1 and traffic[0].get("revision") == revision
            and traffic[0].get("percent") == 100, "Unexpected serving traffic")
    diagnose_release_10(token, candidate)
    require(config(name, token) == snapshot, "Configuration changed during evidence capture")
    evidence = inventory.sanitize(snapshot)
    path = Path("recovery-evidence") / "saveProposalEnrollmentAgreement.json"
    path.parent.mkdir(mode=0o700, exist_ok=True)
    with path.open("x") as stream:
        json.dump(evidence, stream, indent=2, sort_keys=True)
    print(f"Captured redacted Function, Cloud Run and both IAM policies: {digest(evidence)}")


def main():
    mode = os.environ["RELEASE_MODE"]
    guard(mode)
    root = Path("application")
    sha = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    require(sha == PLAN["candidate"], "Application checkout SHA differs")
    packages = {name: package(name, root / "functions") for name in NAMES}
    overlay = assets(root)
    token = authenticated_release_token()
    if mode == "capture-restoration-evidence":
        capture_restoration_evidence(token, packages["saveProposalEnrollmentAgreement"])
        return
    if mode == "diagnose-release-10":
        diagnose_release_10(token, packages["saveProposalEnrollmentAgreement"])
        return
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
            verify_updated_runtime(name, snapshots[name], after)
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
