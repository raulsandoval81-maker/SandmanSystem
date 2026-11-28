#!/usr/bin/env python3
"""Guarded Sprint 1 Rules + Hosting staging release. Fails closed; no production paths."""
import argparse
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]  # repository root
PROJECT = "sandman-combat-staging"
EXPECTED_SOURCE = "0e9d96e3994094fffacbb606ac77f474902bf666"
OLD_SOURCE = "05acb2bfd1d44deabde7f3a2e058284c5caac9fc"
WORKFLOW_REF = "raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main"
BASE_API = "https://firebasehosting.googleapis.com/v1beta1/"
RULE_API = "https://firebaserules.googleapis.com/v1/"
FUNCTION_API = "https://cloudfunctions.googleapis.com/v2/"
EVIDENCE = Path("athlete-sprint1-release-evidence.json")


def require(ok, reason):
    if not ok:
        raise RuntimeError(reason)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def get_token():
    return subprocess.check_output(["gcloud", "auth", "print-access-token"],
                                   text=True, stderr=subprocess.DEVNULL).strip()


def request(token, url, method="GET", body=None, binary=False):
    # Explicitly constrain cloud resource mutation to staging.
    if not (url.startswith(BASE_API + "sites/" + PROJECT + "/") or
            url.startswith(RULE_API + "projects/" + PROJECT + "/") or
            url.startswith(FUNCTION_API + "projects/" + PROJECT + "/") or
            url.startswith("https://upload-firebasehosting.googleapis.com/upload/sites/" + PROJECT + "/")):
        raise RuntimeError("Remote URL outside approved staging resources")
    headers = {"Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = "application/octet-stream" if binary else "application/json"
    payload = body if binary else json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=90) as response:
        data = response.read()
        return data if binary else json.loads(data) if data else {}


def snapshot(token, mod):
    return mod.snapshot(token)


def manifest():
    return json.loads((HERE / "release-manifest.json").read_text())


def prior_evidence():
    return json.loads(Path(os.environ["SPRINT1_BASELINE_JSON"]).read_text())


def audit(mode):
    require(os.environ.get("GITHUB_REPOSITORY") == "raulsandoval81-maker/SandmanSystem", "Wrong repository")
    require(os.environ.get("GITHUB_REF") == "refs/heads/main", "Wrong branch")
    require(os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch", "Manual dispatch required")
    action = os.environ.get("SPRINT1_ACTION")
    workflow_ref = os.environ.get("GITHUB_WORKFLOW_REF")
    resume_workflow = ("raulsandoval81-maker/SandmanSystem/.github/workflows/"
                       "athlete-sprint1-guarded-resume.yml@refs/heads/main")
    resume = mode == "publish" and action == "athlete-sprint1-staging-resume"
    if resume:
        require(workflow_ref == resume_workflow and
                os.environ.get("GITHUB_RUN_ATTEMPT") == "1",
                "Untrusted resume workflow or retried run")
    else:
        require(workflow_ref == WORKFLOW_REF, "Untrusted workflow")
    require(os.environ.get("CONFIRM_PROJECT") == PROJECT, "Wrong project")
    allowed_actions = (
        ("athlete-sprint1-release-preflight", "athlete-sprint1-staging-deploy")
        if mode == "preflight" else
        ("athlete-sprint1-staging-deploy", "athlete-sprint1-staging-resume"))
    require(action in allowed_actions, "Wrong release action")
    if mode == "publish":
        approved = ("APPROVE_SPRINT1_PARTIAL_RESUME_STAGING_ONLY" if resume else
                    "APPROVE_ATHLETE_SPRINT1_STAGING_FUNCTIONS_RULES_HOSTING")
        require(os.environ.get("SPRINT1_APPROVAL") == approved,
                "Distinct staging-only release approval missing")
        require(os.environ.get("SPRINT1_TRANSPORT_APPROVAL") ==
                "APPROVE_STAGING_APPLICATION_AUTH_TRANSPORT",
                "Callable transport approval missing")
    else:
        require(not os.environ.get("SPRINT1_APPROVAL"), "Preflight cannot receive deployment approval")


def load_readonly():
    name = "athlete_sprint1_preflight"
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "scripts/staging/athlete-sprint1-readonly-preflight.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def digest_manifest(entries):
    return sha(json.dumps(sorted(entries.items()), separators=(",", ":")).encode())


def remote_version(token, name):
    return request(token, BASE_API + name)


def remote_manifest(token, version):
    rows = {}
    cursor = ""
    seen = set()
    while True:
        params = urllib.parse.urlencode({"pageSize": 1000, **({"pageToken": cursor} if cursor else {})})
        page = request(token, BASE_API + version + "/files?" + params)
        for record in page.get("files", []):
            path, digest = record["path"], record["hash"]
            require(path.startswith("/") and path not in rows and
                    record.get("status") == "ACTIVE" and
                    re.fullmatch("[A-Fa-f0-9]{64}", digest) is not None,
                    "Invalid live Hosting manifest")
            rows[path] = digest
        cursor = page.get("nextPageToken") or ""
        if not cursor:
            return rows
        require(cursor not in seen, "Repeated Hosting cursor")
        seen.add(cursor)


def read_rules(token, ruleset):
    data = request(token, RULE_API + ruleset)
    files = data.get("source", {}).get("files", [])
    require(len(files) == 1 and isinstance(files[0].get("content"), str),
            "Unexpected multi-file Firestore ruleset")
    return files[0]["content"]


def reviewed_rules_patch(original):
    path = "scripts/staging/p0-containment/firestore.rules"
    candidate = subprocess.check_output(["git", "-C", str(ROOT), "show",
                                         EXPECTED_SOURCE + ":" + path])
    require(sha(candidate) == manifest()["sourceFilesSha256"][path],
            "Reviewed Firestore candidate SHA mismatch")
    old = subprocess.check_output(["git", "-C", str(ROOT), "show",
                                   OLD_SOURCE + ":" + path])
    patch = subprocess.check_output(
        ["git", "-C", str(ROOT), "diff", "--no-ext-diff", "--binary",
         OLD_SOURCE, EXPECTED_SOURCE, "--", path])
    require(patch.startswith(("diff --git a/" + path + " b/" + path).encode()),
            "Expected reviewed Firestore patch missing")
    # Exact source baseline and final candidate must be the result of the reviewed diff.
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        file = root / path
        file.parent.mkdir(parents=True)
        file.write_bytes(old)
        subprocess.run(["git", "apply", "--check", "-"], input=patch, cwd=root,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "apply", "-"], input=patch, cwd=root,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        require(file.read_bytes() == candidate, "Reviewed patch changed source unexpectedly")
        file.write_text(original)
        subprocess.run(["git", "apply", "--check", "-"], input=patch, cwd=root,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "apply", "-"], input=patch, cwd=root,
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # A live baseline with ANY unrelated changes cannot be replaced by a full-file release.
        require(file.read_bytes() == candidate, "Live Rules diverged from reviewed source; stop")
    return candidate.decode()


def source_gzip(raw):
    return subprocess.run(["node", "-e",
                           "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0),{mtime:0}))"],
                          input=raw, capture_output=True, check=True, timeout=30).stdout


def approved_hosting_bytes():
    m = manifest()
    result = {}
    for remote in m["hostingPaths"]:
        source = ROOT / ("public" + remote)
        data = source.read_bytes()
        require(sha(data) == m["sourceFilesSha256"]["public" + remote],
                "Hosting reviewed source mismatch: " + remote)
        zipped = source_gzip(data)
        result[remote] = (sha(zipped), zipped, data)
    require(len(result) == 18 and len({p for p in result}) == 18, "Hosting allowlist expanded")
    return result


def confirm_state(token, phase):
    m = manifest()
    prior = prior_evidence()["snapshot"]
    live = snapshot(token, load_readonly())
    require(live["project"] == PROJECT and live["projectNumber"] == m["projectNumber"],
            "Staging project changed")
    require(live["firestore"] == prior["firestore"], "Live Firestore baseline drift")
    for field in ("release", "version", "fileCount", "manifestSha256", "configSha256",
                  "sprint1TargetCurrentHashes"):
        require(live["hosting"][field] == prior["hosting"][field],
                "Live Hosting baseline drift: " + field)
    prev_funcs = {f["name"]: f for f in prior["functions"]["inventory"]}
    now_funcs = {f["name"]: f for f in live["functions"]["inventory"]}
    expected = {f"projects/{PROJECT}/locations/us-central1/functions/" + item["name"]
                for item in m["functions"]}
    require(len(prev_funcs) == 53 and
            {name: now_funcs.get(name) for name in prev_funcs} == prev_funcs,
            "Existing Functions changed from signed baseline")
    added = set(now_funcs) - set(prev_funcs)
    if phase == "before-functions":
        require(not added, "Unexpected added Function before release")
    else:
        require(added == expected and all(now_funcs[n]["state"] == "ACTIVE" for n in expected),
                "Exactly two active new Athlete callables required")
    return live


def persist(evidence):
    EVIDENCE.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n")


def publish(token, m, data, rules):
    b = m["expectedBaseline"]
    current = remote_manifest(token, b["hostingVersion"])
    require(len(current) == b["hostingFileCount"] and
            digest_manifest(current) == b["hostingManifestSha256"], "Hosting manifest drift")
    body = approved_hosting_bytes()
    proposed = dict(current)
    for path, (digest, _, _) in body.items():
        proposed[path] = digest
    require(set(proposed) == set(current) | set(body) and
            all(proposed[p] == current[p] for p in current if p not in body),
            "Unrelated Hosting assets changed")
    check = remote_version(token, b["hostingVersion"])
    require(check.get("status") == "FINALIZED", "Invalid existing Hosting version")
    require(sha(json.dumps(check.get("config", {}), sort_keys=True).encode()) ==
            b["hostingConfigSha256"], "Hosting config drift")
    evidence = {"status": "STOP_NO_RETRY", "scope": PROJECT,
                "oldHostingVersion": b["hostingVersion"],
                "oldRuleset": b["firestoreRuleset"],
                "functionsAlreadyCreated": True, "lastOperation": "none"}
    persist(evidence)

    # 1. New callables have already passed the create-only gate.
    # 2. Prepare a ruleset from the exact reviewed source; activate before Hosting.
    evidence["lastOperation"] = "create-reviewed-staging-ruleset"
    persist(evidence)
    rule_info = request(token, RULE_API + f"projects/{PROJECT}/rulesets", "POST",
                        {"source": {"files": [{"name": "firestore.rules", "content": rules}]}})
    new_ruleset = rule_info["name"]
    require(new_ruleset.startswith(f"projects/{PROJECT}/rulesets/"),
            "Unexpected created ruleset")
    evidence["newRuleset"] = new_ruleset
    persist(evidence)
    require(read_rules(token, new_ruleset) == rules, "Stored Rules bytes differ")
    confirm_state(token, "after-functions")
    evidence["lastOperation"] = "activate-reviewed-staging-rules"
    persist(evidence)
    released = request(token, RULE_API + b["firestoreRelease"], "PATCH",
                       {"release": {"name": b["firestoreRelease"],
                                    "rulesetName": new_ruleset},
                        "updateMask": "rulesetName"})
    require(released.get("rulesetName") == new_ruleset,
            "Firestore release did not activate approved rules")
    evidence["rulesActive"] = True
    persist(evidence)

    # 3. Preserve complete live Hosting manifest and overlay only 18 reviewed assets.
    evidence["lastOperation"] = "create-staging-hosting-version"
    persist(evidence)
    created = request(token, BASE_API + f"sites/{PROJECT}/versions", "POST",
                      {"config": check["config"]})
    version = created["name"]
    require(re.fullmatch(rf"sites/{PROJECT}/versions/[A-Za-z0-9_-]+", version),
            "Unexpected Hosting version target")
    evidence["preparedHostingVersion"] = version
    persist(evidence)
    uploads = {digest: zipped for digest, zipped, _ in body.values()}
    entries = list(proposed.items())
    for start in range(0, len(entries), 900):
        evidence["lastOperation"] = "populate-staging-hosting-" + str(start)
        persist(evidence)
        part = request(token, BASE_API + version + ":populateFiles", "POST",
                       {"files": dict(entries[start:start + 900])})
        address = part.get("uploadUrl")
        require(isinstance(address, str) and address.startswith(
            "https://upload-firebasehosting.googleapis.com/upload/sites/" + PROJECT + "/versions/"),
            "Hosting upload URL outside staging")
        for digest in part.get("uploadRequiredHashes", []):
            require(digest in uploads, "Firebase requested unrelated Hosting upload")
            evidence["lastOperation"] = "upload-allowlisted-hosting-asset"
            persist(evidence)
            request(token, address.rstrip("/") + "/" + digest,
                    "POST", uploads[digest], binary=True)
    require(remote_manifest(token, version) == proposed, "Prepared Hosting manifest mismatch")
    evidence["lastOperation"] = "finalize-staging-hosting-version"
    persist(evidence)
    finalized = request(token, BASE_API + version + "?update_mask=status",
                        "PATCH", {"status": "FINALIZED"})
    require(finalized.get("status") == "FINALIZED", "Staging Hosting not finalized")
    require(remote_manifest(token, version) == proposed, "Finalized manifest mismatch")
    latest = snapshot(token, load_readonly())
    require(latest["hosting"]["release"] == b["hostingRelease"] and
            latest["hosting"]["version"] == b["hostingVersion"] and
            latest["firestore"]["ruleset"] == new_ruleset,
            "Staging rules or Hosting changed during preparation")
    evidence["lastOperation"] = "publish-18-staging-hosting-assets"
    persist(evidence)
    params = urllib.parse.urlencode({"versionName": version})
    released_host = request(token, BASE_API + f"sites/{PROJECT}/releases?" + params, "POST", {})
    require(released_host["version"]["name"] == version,
            "Unexpected staging Hosting release")
    evidence["newHostingRelease"] = released_host["name"]
    persist(evidence)
    after = snapshot(token, load_readonly())
    require(after["hosting"]["version"] == version and
            after["firestore"]["ruleset"] == new_ruleset and
            after["hosting"]["fileCount"] == len(proposed) and
            after["hosting"]["manifestSha256"] == digest_manifest(proposed),
            "Post-release staging verification failed")
    evidence["status"] = "PUBLISHED_PENDING_AUTHENTICATED_ACCEPTANCE"
    persist(evidence)
    return evidence


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["preflight", "publish"])
    args = parser.parse_args()
    audit(args.mode)
    m = manifest()
    require(m["status"] == "PREPARATION_ONLY_NO_DEPLOYMENT" and
            m["productionAuthorized"] is False and m["deploymentAuthorized"] is False,
            "Manifest must not self-authorize releases")
    token = get_token()
    if args.mode == "preflight":
        state = confirm_state(token, "before-functions")
        original = read_rules(token, state["firestore"]["ruleset"])
        reviewed = reviewed_rules_patch(original)
        approved_hosting_bytes()
        print(json.dumps({"status": "PASS_STAGING_RELEASE_PREFLIGHT",
                          "rulesCandidateSha256": sha(reviewed.encode()),
                          "hostingPaths": 18, "functionsToCreate": 2,
                          "deploymentAuthorized": False}))
    else:
        state = confirm_state(token, "after-functions")
        original = read_rules(token, state["firestore"]["ruleset"])
        reviewed = reviewed_rules_patch(original)
        publish(token, m, state, reviewed)


if __name__ == "__main__":
    main()
