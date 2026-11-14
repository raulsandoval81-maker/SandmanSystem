"""Release the reviewed paid Intake path using source-only Function updates."""
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.parse
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone

import receipt_intake_inventory as inventory

# Reuse the source-only patch, LRO handling, and finalized Hosting verifier.
import importlib
release = importlib.import_module("pr606-cash-check-deploy")

PLAN = json.loads(Path(__file__).with_suffix(".json").read_text())
PROJECT, SITE = inventory.PROJECT, inventory.SITE
HOSTING = release.HOSTING_API
REGION = "us-central1"
NAMES = PLAN["functionOrder"]
EXCLUDED_NAMES = tuple(name for name in PLAN["functions"] if name not in NAMES)
RESTORE_NAME = "saveProposalEnrollmentAgreement"
VERIFY_RESTORATION_MODE = "verify-save-proposal-restoration"
VERIFY_RESTORATION_CONFIRMATION = "VERIFY-SAVE-PROPOSAL-AGREEMENT-READ-ONLY"
RESTORE_CONFIRMATION = "RESTORE-SAVE-PROPOSAL-AGREEMENT-SOURCE-ONLY-43564596875"
FORWARD_RESUME_MODE = "forward-resume-release-10"
VERIFY_FORWARD_MODE = "verify-forward-resume-release-10"
DIAGNOSE_FAILED_FORWARD_MODE = "diagnose-failed-forward-update-15"
DIAGNOSE_FAILED_FORWARD_CONFIRMATION = "DIAGNOSE-FAILED-FORWARD-UPDATE-15-READ-ONLY"
SECURITY_VERIFY_MODE = "verify-issue-handoff-security"
SECURITY_VERIFY_CONFIRMATION = "VERIFY-ISSUE-HANDOFF-PRODUCTION-SECURITY-READ-ONLY"
SECURITY_RETENTION_APPROVAL = "APPROVED-PRIVATE-PRODUCTION-SECURITY-EVIDENCE"
VERIFY_FORWARD_CONFIRMATION = "VERIFY-FORWARD-RESUME-RELEASE-10-READ-ONLY"
FORWARD_RESUME_CONFIRMATION = "FORWARD-RESUME-RELEASE-10-SEVEN-FUNCTIONS-43612662882"
RESTORATION = {
    "configurationSha256": "b4066c965108fbe4793ee44d48b0e4770ba8cb8f8372a27e5e388af802125fc2",
    "candidateGeneration": "1794629107340168",
    "candidateArchiveSha256": "4a3e75891f160f3a5e28acb4b395406e4e6c34dfb7015afbe1d049c02a89f8ed",
    "rollbackGeneration": "1790999969350187",
    "rollbackArchiveSha256": "63b997fe83d1d092480d3e159b2b255fe28b0ec228c9311a765bab92e7f5b6a6",
    "servingRevision": "saveproposalenrollmentagreement-00007-zuk",
    "capturedRuntimeSha256": "68a0c620d9a4dd462d2e151f0c265fe1decab092defe44cb197a67ea4b14890a",
}
release.PROJECT, release.SITE = PROJECT, SITE
release.FUNCTIONS = {name: generation for name, (generation, _) in inventory.FUNCTIONS.items()}
for core_name in ("saveProposalEnrollmentAgreement", "issueProposalEnrollmentHandoff"):
    inventory.FUNCTIONS[core_name] = (2, f"proposals/{core_name}")
    release.FUNCTIONS[core_name] = 2
require = inventory.require


class SecurityViolation(RuntimeError):
    """A collected fact proves security or configuration drift."""


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
    return snapshot


def verify_healthy_serving(snapshot, expected_revision=None, name=RESTORE_NAME):
    run = snapshot["run"]
    service = f"projects/{PROJECT}/locations/{REGION}/services/{name.lower()}"
    ready = run.get("latestReadyRevision", "")
    revision = ready.rsplit("/", 1)[-1]
    require(run.get("name") == service and ready == f"{service}/revisions/{revision}"
            and run.get("latestCreatedRevision") == ready
            and (expected_revision is None or revision == expected_revision)
            and run.get("generation") is not None
            and run.get("generation") == run.get("observedGeneration")
            and run.get("reconciling", False) is False
            and run.get("terminalCondition", {}).get("state") == "CONDITION_SUCCEEDED",
            "Expected Cloud Run revision is not ready")
    configured = [target for target in run.get("traffic", []) if target.get("percent", 0)]
    serving = [target for target in run.get("trafficStatuses", []) if target.get("percent", 0)]
    require(len(configured) == 1
            and configured[0].get("type") == "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
            and configured[0].get("percent") == 100
            and len(serving) == 1 and serving[0].get("revision") == revision
            and serving[0].get("percent") == 100,
            "Unexpected serving traffic")
    return revision


def verify_function_healthy(name, snapshot, expected_revision=None):
    """Require ACTIVE Gen1 or healthy single-revision Gen2 service state."""
    if release.FUNCTIONS[name] == 1:
        version = str(snapshot["function"].get("versionId", ""))
        require(snapshot["function"].get("status") == "ACTIVE" and version.isdigit()
                and (expected_revision is None or version == str(expected_revision)),
                f"{name}: expected ACTIVE Gen1 version is not serving")
        return version
    return verify_healthy_serving(snapshot, expected_revision, name)


def hosting_state(token):
    configuration, manifest = hosting_baseline(token)
    return {"active": active(token), "configuration": configuration, "manifest": manifest}


def unrelated_state(token):
    return {
        "functions": {name: config(name, token) for name in NAMES if name != RESTORE_NAME},
        "hosting": hosting_state(token),
        "rules": verify_rules(token),
    }


def require_unrelated_unchanged(token, expected):
    require(unrelated_state(token) == expected,
            "Excluded Functions, Hosting, or Firestore Rules changed")


def forward_state(token):
    """Capture every resource that must remain exact between forward writes."""
    return {
        "functions": {name: config(name, token) for name in NAMES},
        "excluded": {name: config(name, token) for name in EXCLUDED_NAMES},
        "hosting": hosting_state(token),
        "rules": verify_rules(token),
    }


def require_forward_state(token, expected):
    require(forward_state(token) == expected,
            "Function, Hosting, or Firestore Rules changed outside the verified forward state")


def verify_original_function_baseline(name, snapshot):
    require(name in NAMES[1:], "Only remaining Functions use original baselines")
    require(digest(inventory.sanitize(snapshot))
            == PLAN["functions"][name]["configurationSha256"],
            f"{name}: original configuration fingerprint mismatch")
    return verify_function_healthy(name, snapshot)


def verified_excluded_baselines(token):
    """Reject pre-existing configuration drift in all four non-target Functions."""
    excluded = {name: config(name, token) for name in EXCLUDED_NAMES}
    for name, snapshot in excluded.items():
        require(digest(inventory.sanitize(snapshot))
                == PLAN["functions"][name]["configurationSha256"],
                f"{name}: excluded Function configuration fingerprint mismatch")
    return excluded


def forward_resume_preflight(token, packages):
    """Verify the interrupted release boundary without using the stale first baseline."""
    first = config(RESTORE_NAME, token)
    require(digest(inventory.sanitize(first)) == RESTORATION["configurationSha256"],
            "First Function configuration fingerprint mismatch")
    verify_release_permissions(token)
    first_revision = verify_function_healthy(
        RESTORE_NAME, first, RESTORATION["servingRevision"])
    diagnostic = diagnose_release_10(token, packages[RESTORE_NAME], report=False)
    require(diagnostic["sourceFilesMatch"]
            and diagnostic["liveArchiveSha256"] == RESTORATION["candidateArchiveSha256"],
            "First Function candidate source mismatch")

    snapshots = {RESTORE_NAME: first}
    recovery = {}
    for name in NAMES[1:]:
        snapshot = config(name, token)
        verify_original_function_baseline(name, snapshot)
        archive = pinned_recovery(name, snapshot, token)
        require(digest(archive_hashes(archive))
                == PLAN["functions"][name]["recoveryFilesSha256"],
                f"{name}: rollback archive mismatch")
        snapshots[name] = snapshot
        recovery[name] = archive

    excluded = verified_excluded_baselines(token)

    hosting = hosting_state(token)
    rules = verify_rules(token)
    expected = {"functions": snapshots, "excluded": excluded,
                "hosting": hosting, "rules": rules}
    require_forward_state(token, expected)
    return expected, recovery, first_revision


def verify_forward_resume_readonly(token, packages, overlay):
    """Read-only full forward-release preflight. Never stage Hosting or update Functions."""
    try:
        expected, recovery, _ = forward_resume_preflight(token, packages)
        manifest = expected["hosting"]["manifest"]
        require(set(overlay) == set(PLAN["hosting"]["assets"]),
                "Candidate Hosting asset scope differs")
        for path, body in overlay.items():
            require(manifest.get(path) == PLAN["hosting"]["assets"][path]["baselineHash"],
                    f"{path}: baseline Hosting asset drift")
            require(inventory.sha(body) == PLAN["hosting"]["assets"][path]["hostingHash"],
                    f"{path}: candidate Hosting bytes differ")
        require_forward_state(token, expected)
    except Exception:
        print(json.dumps({"forwardResumeReadOnly": "FAIL",
                          "historicalFirstFunctionFingerprintMatches": False}), flush=True)
        raise SystemExit(1) from None
    print(json.dumps({
        "forwardResumeReadOnly": "PASS",
        "alreadyUpdatedFunction": RESTORE_NAME,
        "remainingFunctionsVerified": list(NAMES[1:]),
        "excludedFunctionsVerified": list(EXCLUDED_NAMES),
        "candidateHostingAssetsVerified": len(overlay),
        "rollbackArchivesVerified": len(recovery),
        "hostingBaselineVerified": True,
        "firestoreRulesVerified": True,
        "productionWrites": 0,
        "historicalFirstFunctionFingerprintMatches": False,
    }, sort_keys=True), flush=True)


def diagnose_failed_forward_update(token, packages):
    """Read-only evidence after an uncertain first Function update; never resumes or restores."""
    target = NAMES[1]
    require(target == "issueProposalEnrollmentHandoff", "Unexpected diagnostic target")
    snapshot = config(target, token)
    current_source = archive_hashes(source(target, snapshot, token))
    candidate_source = archive_hashes(packages[target])
    original = PLAN["functions"][target]
    current_runtime_sha = digest(runtime(target, inventory.sanitize(snapshot)))
    original_configuration_sha = digest(inventory.sanitize(snapshot))
    revision = verify_function_healthy(target, snapshot)
    # Assert the untouched boundaries, separately from the target's now-uncertain state.
    first = config(RESTORE_NAME, token)
    require(digest(inventory.sanitize(first)) == RESTORATION["configurationSha256"],
            "Already-updated Function drift")
    other = {}
    for name in NAMES[2:]:
        value = config(name, token)
        other[name] = digest(inventory.sanitize(value)) == PLAN["functions"][name]["configurationSha256"]
    excluded = verified_excluded_baselines(token)
    hosting_baseline(token)
    verify_rules(token)
    print(json.dumps({
        "failedForwardDiagnostic": "INSPECTED_NOT_CLEARED",
        "target": target,
        "targetServingRevisionSha256": inventory.sha(revision.encode()),
        "targetCandidateSourceMatches": current_source == candidate_source,
        "targetOriginalSourceMatches": digest(current_source) == original["recoveryFilesSha256"],
        "targetOriginalConfigurationMatches": original_configuration_sha == original["configurationSha256"],
        "targetPinnedRuntimeMatches": current_runtime_sha == original["runtimeSha256"],
        "targetCurrentRuntimeSha256": current_runtime_sha,
        "otherRemainingFunctionsUnchanged": other,
        "excludedFunctionCountVerified": len(excluded),
        "alreadyUpdatedFunctionUnchanged": True,
        "hostingBaselineUnchanged": True,
        "firestoreRulesUnchanged": True,
        "productionWrites": 0,
        "deploymentAuthorized": False,
    }, sort_keys=True), flush=True)


def verify_security_read_permissions(token):
    """Require only the reads used by the separately gated security inspection."""
    required = [
        "cloudfunctions.functions.get", "cloudfunctions.functions.getIamPolicy",
        "cloudfunctions.functions.sourceCodeGet",
        "firebasehosting.sites.get", "firebaserules.releases.get",
        "firebaserules.rulesets.get", "run.services.get", "run.services.getIamPolicy",
    ]
    url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions"
    granted = json.loads(inventory.request(url, token, {"permissions": required}))
    missing = sorted(set(required) - set(granted.get("permissions", [])))
    require(not missing, "Production security read permissions unavailable")
    return required


def invocation_summary(snapshot):
    """Reduce invocation policies without retaining or emitting member identities."""
    def policy(value, role):
        bindings = [item for item in value.get("bindings", []) if item.get("role") == role]
        members = [member for item in bindings for member in item.get("members", [])]
        conditions = [item["condition"] for item in value.get("bindings", []) if "condition" in item]
        return {
            "bindingCount": len(bindings),
            "memberCount": len(members),
            "anonymous": any(member in {"allUsers", "allAuthenticatedUsers"} for member in members),
            "conditionalBindingCount": len(conditions),
            "conditionsSha256": digest(inventory.sanitize(conditions)),
            "policySha256": digest(inventory.sanitize(value)),
        }
    return {
        "cloudFunctions": policy(snapshot["iam"], "roles/cloudfunctions.invoker"),
        "cloudRun": policy(snapshot["runIam"], "roles/run.invoker"),
    }


def protected_reference_summary(snapshot):
    """Hash runtime identity and secret references without retaining their values."""
    runtime_account = snapshot["function"].get("serviceConfig", {}).get("serviceAccountEmail")
    run_account = snapshot["run"].get("template", {}).get("serviceAccount")
    require(runtime_account and runtime_account == run_account,
            "Function and Cloud Run runtime service accounts differ")
    references = []

    def visit(value, key=""):
        if isinstance(value, dict):
            if key in {"secretEnvironmentVariables", "secretKeyRef"}:
                references.append(digest(inventory.sanitize(value)))
                return
            for child_key, child in value.items():
                visit(child, child_key)
        elif isinstance(value, list):
            for child in value:
                visit(child, key)

    visit(snapshot["function"])
    visit(snapshot["run"])
    service = snapshot["function"].get("serviceConfig", {})
    run = snapshot["run"]
    containers = run.get("template", {}).get("containers", [])
    environment = [container.get("env", []) for container in containers]
    networking = {
        "ingress": run.get("ingress"),
        "invokerIamDisabled": run.get("invokerIamDisabled"),
        "vpcAccess": service.get("vpcConnector"),
        "vpcEgress": service.get("vpcConnectorEgressSettings"),
    }
    return {
        "runtimeServiceAccountSha256": inventory.sha(runtime_account.encode()),
        "secretReferenceCount": len(set(references)),
        "secretReferencesSha256": digest(sorted(set(references))),
        "environmentConfigurationSha256": digest(inventory.sanitize(environment)),
        "networking": networking,
        "trafficSha256": digest(inventory.sanitize({
            "configured": run.get("traffic", []),
            "serving": run.get("trafficStatuses", []),
        })),
    }, runtime_account


def runtime_access_summary(runtime_account, token):
    """Use Cloud Asset IAM search when the existing credential supports it."""
    base = f"https://cloudasset.googleapis.com/v1/projects/{PROJECT}:searchAllIamPolicies"
    query = urllib.parse.urlencode({"query": f"policy:{runtime_account}", "pageSize": "500"})
    request = urllib.request.Request(base + "?" + query,
                                     headers={"Authorization": "Bearer " + token}, method="GET")
    try:
        opener = urllib.request.build_opener(inventory.NoRedirect())
        with opener.open(request, timeout=45) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code in {401, 403, 404}:
            return {"supported": False, "reason": "cloud-asset-access-unavailable"}
        raise RuntimeError("Runtime service-account access analysis failed") from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise RuntimeError("Runtime service-account access analysis unavailable") from None
    require(not payload.get("nextPageToken"),
            "Runtime access analysis exceeds the bounded protected evidence read")
    policies = payload.get("results", [])
    require(isinstance(policies, list), "Malformed runtime access analysis")
    return {"supported": True, "policyCount": len(policies),
            "policySetSha256": digest(inventory.sanitize(policies))}


def security_evidence_destination(env=None):
    env = os.environ if env is None else env
    if (env.get("SECURITY_EVIDENCE_RETENTION_APPROVAL") != SECURITY_RETENTION_APPROVAL
            or not env.get("SECURITY_EVIDENCE_GCS_URI")
            or not env.get("SECURITY_EVIDENCE_RETENTION_DAYS")):
        return None
    uri = env["SECURITY_EVIDENCE_GCS_URI"].rstrip("/")
    require(re.fullmatch(r"gs://[a-z0-9][a-z0-9._-]{2,221}/[A-Za-z0-9._/-]+", uri),
            "Protected security evidence destination is invalid")
    days = int(env["SECURITY_EVIDENCE_RETENTION_DAYS"])
    require(days >= 30, "Protected security evidence retention is insufficient")
    return uri, days


def retain_protected_security_evidence(evidence, env=None):
    env = os.environ if env is None else env
    destination = security_evidence_destination(env)
    require(destination is not None, "Approved persistent security evidence destination missing")
    base_uri, retention_days = destination
    root = Path(env.get("SECURITY_EVIDENCE_ROOT", "")).resolve()
    path = Path(env.get("SECURITY_EVIDENCE_PATH", "")).resolve()
    require(path.parent == root and path.name == "issue-handoff-security-verification.json",
            "Protected security evidence destination differs")
    captured_at = datetime.now(timezone.utc).isoformat()
    payload = {**evidence, "capturedAt": captured_at,
               "retentionDaysRequired": retention_days}
    payload_bytes = (json.dumps(payload, sort_keys=True) + "\n").encode()
    evidence_sha = inventory.sha(payload_bytes)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        output.write(payload_bytes.decode())
    require((path.stat().st_mode & 0o777) == 0o600,
            "Protected security evidence permissions differ")
    bucket = base_uri.split("/", 3)[2]
    bucket_uri = "gs://" + bucket
    policy = json.loads(subprocess.check_output(
        ["gcloud", "storage", "buckets", "get-iam-policy", bucket_uri, "--format=json"],
        text=True))
    public = {"allUsers", "allAuthenticatedUsers"}
    require(not any(public & set(binding.get("members", []))
                    for binding in policy.get("bindings", [])),
            "Security evidence bucket permits public access")
    description = json.loads(subprocess.check_output(
        ["gcloud", "storage", "buckets", "describe", bucket_uri, "--format=json"],
        text=True))
    retention = description.get("retentionPolicy", {})
    uniform = description.get("iamConfiguration", {}).get("uniformBucketLevelAccess", {})
    require(uniform.get("enabled") is True
            and int(retention.get("retentionPeriod", 0)) >= retention_days * 86400,
            "Security evidence bucket controls are insufficient")
    run_id = env.get("GITHUB_RUN_ID", "")
    run_attempt = env.get("GITHUB_RUN_ATTEMPT", "")
    require(run_id.isdigit() and run_attempt.isdigit(), "Protected run identity missing")
    object_uri = (f"{base_uri}/{run_id}-{run_attempt}/"
                  "issue-handoff-security-verification.json")
    subprocess.run([
        "gcloud", "storage", "cp", str(path), object_uri,
        "--if-generation-match=0", f"--custom-metadata=sha256={evidence_sha}", "--quiet",
    ], check=True, capture_output=True, text=True)
    metadata = json.loads(subprocess.check_output(
        ["gcloud", "storage", "objects", "describe", object_uri, "--format=json"],
        text=True))
    require(metadata.get("metadata", {}).get("sha256") == evidence_sha
            and int(metadata.get("size", -1)) == len(payload_bytes)
            and str(metadata.get("generation", "")).isdigit(),
            "Persisted security evidence integrity verification failed")
    return {"evidenceSha256": evidence_sha,
            "objectGenerationSha256": inventory.sha(str(metadata["generation"]).encode()),
            "capturedAt": captured_at}


def security_collection_status(candidate_matches, runtime_access_supported):
    if not candidate_matches:
        return "FAIL"
    if not runtime_access_supported:
        return "UNVERIFIED"
    return "COLLECTED_NOT_CLEARED"


def verify_issue_handoff_security(token, packages, env=None):
    """Read-only security inspection; current and historical baselines stay separate."""
    env = os.environ if env is None else env
    if security_evidence_destination(env) is None:
        print(json.dumps({
            "issueHandoffSecurityVerification": "UNVERIFIED",
            "reason": "approved-private-evidence-retention-not-configured",
            "independentReviewPossible": False,
            "productionWrites": 0,
            "deploymentAuthorized": False,
        }, sort_keys=True), flush=True)
        return "UNVERIFIED"
    target = "issueProposalEnrollmentHandoff"
    require(target == NAMES[1], "Unexpected security verification target")
    verify_security_read_permissions(token)
    current = config(target, token)
    revision = verify_function_healthy(target, current)
    invocation = invocation_summary(current)
    protected, runtime_account = protected_reference_summary(current)
    access = runtime_access_summary(runtime_account, token)
    current_files = archive_hashes(source(target, current, token))
    candidate_files = archive_hashes(packages[target])

    snapshots = {target: current}
    first = config(RESTORE_NAME, token)
    require(digest(inventory.sanitize(first)) == RESTORATION["configurationSha256"],
            "Already-updated Function current baseline drift")
    snapshots[RESTORE_NAME] = first
    for name in NAMES[2:]:
        value = config(name, token)
        verify_original_function_baseline(name, value)
        snapshots[name] = value
    excluded = verified_excluded_baselines(token)
    snapshots.update(excluded)
    hosting_state_value = hosting_state(token)
    rules = verify_rules(token)

    recovery = {}
    for name, value in snapshots.items():
        archive = pinned_recovery(name, value, token)
        expected = PLAN["functions"][name]
        require(digest(archive_hashes(archive)) == expected["recoveryFilesSha256"],
                f"{name}: pinned recovery archive mismatch")
        recovery[name] = {
            "reference": expected["reference"],
            "archiveSha256": inventory.sha(archive),
            "fileSetSha256": expected["recoveryFilesSha256"],
        }

    if config(target, token) != current:
        raise SecurityViolation("Target configuration changed during security verification")
    if hosting_state(token) != hosting_state_value:
        raise SecurityViolation("Hosting changed during security verification")
    if verify_rules(token) != rules:
        raise SecurityViolation("Firestore Rules changed during security verification")
    historical = PLAN["functions"][target]
    evidence = {
        "mode": "READ_ONLY",
        "target": target,
        "resources": {
            "cloudFunction": current["function"].get("name"),
            "cloudRunService": current["run"].get("name"),
        },
        "current": {
            "configurationSha256": digest(inventory.sanitize(current)),
            "runtimeSha256": digest(runtime(target, inventory.sanitize(current))),
            "sourceFilesSha256": digest(current_files),
            "servingRevisionSha256": inventory.sha(revision.encode()),
            "candidateSourceMatches": current_files == candidate_files,
            "invocation": invocation,
            "protectedReferences": protected,
            "runtimeAccess": access,
        },
        "historical": {
            "configurationSha256": historical["configurationSha256"],
            "runtimeSha256": historical["runtimeSha256"],
            "recoveryFilesSha256": historical["recoveryFilesSha256"],
            "reference": historical["reference"],
        },
        "remainingBaselines": {
            "functionCount": len(snapshots) - 1,
            "hostingConfigurationSha256": digest(hosting_state_value["configuration"]),
            "hostingManifestSha256": digest(hosting_state_value["manifest"]),
            "firestoreRulesSha256": digest(rules),
        },
        "recoveryArchives": recovery,
        "productionWrites": 0,
        "deploymentAuthorized": False,
    }
    candidate_matches = current_files == candidate_files
    retention = retain_protected_security_evidence(evidence, env)
    status = security_collection_status(candidate_matches, access["supported"])
    print(json.dumps({
        "issueHandoffSecurityVerification": status,
        "target": target,
        "servingHealthy": True,
        "candidateSourceMatches": candidate_matches,
        "invocationEvidenceCollected": True,
        "securityConfigurationApproved": False,
        "secretReferenceCount": protected["secretReferenceCount"],
        "runtimeAccessAnalysisSupported": access["supported"],
        "remainingFunctionBaselinesVerified": len(snapshots) - 1,
        "recoveryArchivesVerified": len(recovery),
        "hostingBaselineVerified": True,
        "firestoreRulesVerified": True,
        "protectedEvidenceRetained": True,
        "evidenceSha256": retention["evidenceSha256"],
        "independentReviewPossible": True,
        "productionWrites": 0,
        "deploymentAuthorized": False,
    }, sort_keys=True), flush=True)
    return status


def forward_resume(token, packages, overlay):
    """Resume release #10 without touching its already-updated first Function."""
    expected, recovery, first_revision = forward_resume_preflight(token, packages)
    configuration = expected["hosting"]["configuration"]
    manifest = expected["hosting"]["manifest"]
    proposed = dict(manifest)
    payloads = {}
    for path, body in overlay.items():
        require(manifest.get(path) == PLAN["hosting"]["assets"][path]["baselineHash"],
                f"{path}: asset baseline drift")
        proposed[path] = inventory.sha(body)
        payloads[proposed[path]] = body

    in_flight = "Hosting overlay preparation"
    try:
        version = prepare_hosting(configuration, proposed, payloads, token)
        in_flight = None
        for name in NAMES[1:]:
            require_forward_state(token, expected)
            before = expected["functions"][name]
            previous_revision = verify_function_healthy(name, before)
            in_flight = name
            release.source_update(name, packages[name], token)
            after = config(name, token)
            new_revision = verify_function_healthy(name, after)
            require(new_revision != previous_revision,
                    f"{name}: source update did not create a new serving revision")
            verify_updated_runtime(name, before, after)
            require(archive_hashes(source(name, after, token))
                    == archive_hashes(packages[name]),
                    f"{name}: candidate source file hashes differ")
            expected["functions"][name] = after
            in_flight = None
            require_forward_state(token, expected)
            print(f"Verified forward update {name}", flush=True)

        require(config(RESTORE_NAME, token) == expected["functions"][RESTORE_NAME],
                "First Function changed during forward resume")
        require(verify_function_healthy(RESTORE_NAME, expected["functions"][RESTORE_NAME],
                                        first_revision) == first_revision,
                "First Function serving revision changed")
        in_flight = "Hosting publication"
        publish(version, token)
        release.verify_version(version, configuration, proposed, token)
        in_flight = None
        require(verify_rules(token) == expected["rules"], "Firestore Rules changed")
        for name in NAMES:
            require(config(name, token) == expected["functions"][name],
                    f"{name}: final Function state differs")
        for name in EXCLUDED_NAMES:
            require(config(name, token) == expected["excluded"][name],
                    f"{name}: excluded Function changed during Hosting publication")
        print(json.dumps({
            "forwardResume": "PASS",
            "alreadyUpdatedFunction": RESTORE_NAME,
            "deployedFunctions": NAMES[1:],
            "hostingAssets": sorted(PLAN["hosting"]["assets"]),
            "hostingVersion": version,
            "firestoreRulesChanged": False,
            "historicalFirstFunctionFingerprintMatches": False,
            "rollbackArchivesVerified": sorted(recovery),
        }, sort_keys=True), flush=True)
    except Exception:
        print(json.dumps({"forwardResume": "FAIL", "STOP_NO_RETRY": True,
                          "uncertainWrite": in_flight or "none"}, sort_keys=True), flush=True)
        raise


def restoration_preflight(token, candidate):
    """Verify the exact restoration prerequisites using production reads."""
    name = RESTORE_NAME
    before = config(name, token)
    require(digest(inventory.sanitize(before)) == RESTORATION["configurationSha256"],
            "Restoration configuration fingerprint mismatch")
    prior_revision = verify_healthy_serving(before, RESTORATION["servingRevision"])
    diagnostic = diagnose_release_10(token, candidate, report=False)
    require(diagnostic["sourceFilesMatch"]
            and diagnostic["liveArchiveSha256"] == RESTORATION["candidateArchiveSha256"],
            "Current candidate source differs from reviewed package")
    rollback_archive = pinned_recovery(name, before, token)
    reference = PLAN["functions"][name]["reference"]
    require(str(reference["generation"]) == RESTORATION["rollbackGeneration"]
            and inventory.sha(rollback_archive) == RESTORATION["rollbackArchiveSha256"]
            and digest(archive_hashes(rollback_archive))
            == PLAN["functions"][name]["recoveryFilesSha256"],
            "Pinned restoration archive differs from reviewed evidence")
    excluded = unrelated_state(token)
    for excluded_name, snapshot in excluded["functions"].items():
        require(digest(inventory.sanitize(snapshot)) == PLAN["functions"][excluded_name]["configurationSha256"],
                f"{excluded_name}: Excluded Function configuration fingerprint mismatch")
    require(config(name, token) == before, "Target Function changed before restoration")
    require_unrelated_unchanged(token, excluded)
    return before, prior_revision, rollback_archive, excluded


def verify_single_function_restoration(root):
    """Emit a public-safe report from the guarded, read-only mode."""
    try:
        candidate = package(RESTORE_NAME, root / "functions")
        token = authenticated_release_token()
        _, revision, _, excluded = restoration_preflight(token, candidate)
    except Exception:
        # The runner log is public. Exception text may contain API or source details.
        print(json.dumps({"restorationPreflight": "FAIL", "function": RESTORE_NAME,
                          "historicalRuntimeFingerprintMatches": False}), flush=True)
        raise SystemExit(1) from None
    print(json.dumps({
        "restorationPreflight": "PASS",
        "function": RESTORE_NAME,
        "servingRevision": revision,
        "trafficPercent": 100,
        "configurationSha256": RESTORATION["configurationSha256"],
        "functionAndRunIamVerified": True,
        "candidateArchiveSha256": RESTORATION["candidateArchiveSha256"],
        "rollbackArchiveSha256": RESTORATION["rollbackArchiveSha256"],
        "excludedFunctionBaselinesVerified": sorted(excluded["functions"]),
        "hostingBaselineVerified": True,
        "firestoreRulesBaselineVerified": True,
        "historicalRuntimeFingerprintMatches": False,
    }, sort_keys=True), flush=True)


def restore_single_function(token, candidate):
    """Separately authorized source-only restoration for one interrupted Function."""
    name = RESTORE_NAME
    before, prior_revision, rollback_archive, excluded = restoration_preflight(token, candidate)
    try:
        release.source_update(name, rollback_archive, token)
    except Exception:
        print(json.dumps({"STOP_NO_RETRY": True, "uncertainWrite": name}, sort_keys=True), flush=True)
        raise
    after = config(name, token)
    restored_revision = verify_healthy_serving(after)
    require(restored_revision != prior_revision,
            "Restoration did not create a new serving revision")
    verify_updated_runtime(name, before, after)
    restored_archive = source(name, after, token)
    restored_files = archive_hashes(restored_archive)
    require(restored_files == archive_hashes(rollback_archive)
            and digest(restored_files) == PLAN["functions"][name]["recoveryFilesSha256"],
            "Restored source differs from pinned rollback archive")
    require_unrelated_unchanged(token, excluded)
    print(json.dumps({
        "function": name,
        "previousRevision": prior_revision,
        "restoredRevision": restored_revision,
        "restoredArchiveSha256": inventory.sha(restored_archive),
        "restoredArchiveByteForByteMatch":
            inventory.sha(restored_archive) == RESTORATION["rollbackArchiveSha256"],
        "restoredFileHashesMatch": True,
        "configurationProtected": True,
        "excludedResourcesUnchanged": True,
        "historicalRuntimeFingerprintMatches": False,
        "capturedCurrentRuntimeSha256": RESTORATION["capturedRuntimeSha256"],
        "historicalRuntimeSha256": PLAN["functions"][name]["runtimeSha256"],
    }, sort_keys=True), flush=True)


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


def verify_release_permissions(token):
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
    return required


def preflight(token):
    verify_release_permissions(token)
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
    require(mode in {"preflight", "diagnose-release-10", "capture-restoration-evidence", VERIFY_RESTORATION_MODE,
                     "restore-save-proposal-agreement", FORWARD_RESUME_MODE, VERIFY_FORWARD_MODE,
                     DIAGNOSE_FAILED_FORWARD_MODE, SECURITY_VERIFY_MODE,
                     "deploy", "rollback"}, "Unsupported mode")
    if mode == VERIFY_RESTORATION_MODE:
        require(os.environ.get("CONFIRM_RELEASE") == VERIFY_RESTORATION_CONFIRMATION,
                "Read-only restoration verification confirmation missing")
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
    if mode == "restore-save-proposal-agreement":
        require(os.environ.get("CONFIRM_RELEASE") == RESTORE_CONFIRMATION,
                "Single-Function restoration confirmation missing")
    if mode == VERIFY_FORWARD_MODE:
        require(os.environ.get("CONFIRM_RELEASE") == VERIFY_FORWARD_CONFIRMATION,
                "Read-only forward verification confirmation missing")
    if mode == DIAGNOSE_FAILED_FORWARD_MODE:
        require(os.environ.get("CONFIRM_RELEASE") == DIAGNOSE_FAILED_FORWARD_CONFIRMATION,
                "Failed forward-update diagnostic confirmation missing")
    if mode == SECURITY_VERIFY_MODE:
        require(os.environ.get("CONFIRM_RELEASE") == SECURITY_VERIFY_CONFIRMATION,
                "Issue handoff security verification confirmation missing")
    if mode == FORWARD_RESUME_MODE:
        require(os.environ.get("CONFIRM_RELEASE") == FORWARD_RESUME_CONFIRMATION,
                "Forward-resume owner confirmation missing")
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


def diagnose_release_10(token, candidate, *, report=True):
    """Read the pinned live source and compare protected fingerprints without writes."""
    name = "saveProposalEnrollmentAgreement"
    expected = PLAN["functions"][name]
    before = config(name, token)
    live = before["function"]["buildConfig"]["sourceProvenance"]["resolvedStorageSource"]
    generation = RESTORATION["candidateGeneration"]
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
    if report:
        print(json.dumps(result, sort_keys=True), flush=True)
    require(result["sourceFilesMatch"], "Release #10 live source differs from reviewed package")
    return result


def capture_restoration_evidence(token, candidate):
    """Capture redacted production evidence for the exact interrupted update."""
    name = "saveProposalEnrollmentAgreement"
    snapshot = config(name, token)
    verify_healthy_serving(snapshot, RESTORATION["servingRevision"])
    result = diagnose_release_10(token, candidate, report=False)
    require(config(name, token) == snapshot, "Configuration changed during evidence capture")
    # The protected run log is the receipt. A future authorized run must re-read
    # all four records and match this digest before making any write.
    print(json.dumps({
        "configurationSha256": digest(inventory.sanitize(snapshot)),
        "sourceFilesMatch": result["sourceFilesMatch"],
        "liveArchiveSha256": result["liveArchiveSha256"],
        "rollbackArchiveSha256": result["rollbackArchiveSha256"],
        "liveRuntimeSha256": result["liveRuntimeSha256"],
        "runtimeMatches": result["runtimeMatches"],
        "servingRevisionVerified": True,
    }, sort_keys=True), flush=True)


def main():
    mode = os.environ["RELEASE_MODE"]
    guard(mode)
    root = Path("application")
    sha = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    require(sha == PLAN["candidate"], "Application checkout SHA differs")
    if mode == VERIFY_RESTORATION_MODE:
        verify_single_function_restoration(root)
        return
    if mode == "restore-save-proposal-agreement":
        candidate = package(RESTORE_NAME, root / "functions")
        token = authenticated_release_token()
        restore_single_function(token, candidate)
        return
    if mode == SECURITY_VERIFY_MODE:
        target = "issueProposalEnrollmentHandoff"
        candidate = package(target, root / "functions")
        token = authenticated_release_token()
        try:
            status = verify_issue_handoff_security(token, {target: candidate})
        except SecurityViolation:
            print(json.dumps({
                "issueHandoffSecurityVerification": "FAIL",
                "securityConfigurationApproved": False,
                "productionWrites": 0,
                "deploymentAuthorized": False,
            }, sort_keys=True), flush=True)
            raise SystemExit(1) from None
        except RuntimeError:
            print(json.dumps({
                "issueHandoffSecurityVerification": "UNVERIFIED",
                "securityConfigurationApproved": False,
                "productionWrites": 0,
                "deploymentAuthorized": False,
            }, sort_keys=True), flush=True)
            raise SystemExit(1) from None
        if status != "COLLECTED_NOT_CLEARED":
            raise SystemExit(1)
        return
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
    if mode == VERIFY_FORWARD_MODE:
        verify_forward_resume_readonly(token, packages, overlay)
        return
    if mode == DIAGNOSE_FAILED_FORWARD_MODE:
        diagnose_failed_forward_update(token, packages)
        return
    if mode == FORWARD_RESUME_MODE:
        forward_resume(token, packages, overlay)
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
