"""Protected source-only PR #614 staging release: eight Functions, Rules, four Hosting assets."""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.parse
import zipfile

HERE = Path(__file__).resolve().parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


preflight = load("pr614_preflight", "pr614-readonly-preflight.py")
release = load("pr606_release_helpers", "pr606-cash-check-deploy.py")
inventory = preflight.inventory
require = inventory.require

ACTION = "pr614-staging-deploy"
APPROVAL = "APPROVE_PR614_STAGING_EIGHT_FUNCTIONS_RULES_FOUR_ASSETS"
SHA = preflight.SHA
PROJECT, REGION, SITE = inventory.PROJECT, inventory.REGION, inventory.SITE
FUNCTIONS = {name: generation for name, (generation, _) in preflight.FUNCTIONS.items()}
ASSETS = preflight.ASSETS
ENTRY_POINTS = {name: f"lib/{path}.js" for name, (_, path) in preflight.FUNCTIONS.items()}
FUNCTION_API = "https://cloudfunctions.googleapis.com/"
RULES_API = "https://firebaserules.googleapis.com/v1/"
HOSTING_API = "https://firebasehosting.googleapis.com/v1beta1/"

# Reuse the established source-only updater while binding it to this exact scope.
release.FUNCTIONS = FUNCTIONS


def guard(env):
    expected = {
        "GITHUB_REPOSITORY": inventory.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW,
        "REQUESTED_ACTION": ACTION,
        "CONFIRM_PROJECT": PROJECT,
        "CONFIRM_SHA": SHA,
        "DEPLOY_APPROVAL": APPROVAL,
    }
    for key, value in expected.items():
        require(env.get(key) == value, f"Unexpected {key}")
    require(bool(env.get("EXPECTED_HOSTING_RELEASE")), "Missing EXPECTED_HOSTING_RELEASE")
    require(bool(env.get("EXPECTED_HOSTING_VERSION")), "Missing EXPECTED_HOSTING_VERSION")


def write(operation, url, method, payload, token, content_type="application/json"):
    return release.write(operation, url, method, payload, token, content_type)


def get(operation, url, token):
    return release.get(operation, url, token)


def gzip(data):
    return subprocess.run(
        ["node", "-e", "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0),{mtime:0}))"],
        input=data, capture_output=True, check=True, timeout=30,
    ).stdout


def current_hosting(token, first_asset):
    return inventory.hosting(lambda operation, url: get(operation, url, token), first_asset)


def prepare_hosting(baseline, token):
    proposed = dict(baseline["manifest"])
    bodies = {}
    for path in ASSETS:
        body = gzip(Path("pr614-candidate/public" + path).read_bytes())
        digest = inventory.sha(body)
        require(proposed.get(path) != digest, f"Hosting asset already current: {path}")
        proposed[path] = digest
        bodies[digest] = body
    require(set(proposed) == set(baseline["manifest"]), "Hosting path set changed")
    version = write("Create Hosting version", HOSTING_API + SITE + "/versions", "POST",
                    {"config": baseline["config"]}, token)["name"]
    require(re.fullmatch(rf"{SITE}/versions/[\w-]+", version), "Unexpected Hosting version")
    entries = list(proposed.items())
    uploaded = set()
    for start in range(0, len(entries), 900):
        result = write("Populate Hosting version", HOSTING_API + version + ":populateFiles", "POST",
                       {"files": dict(entries[start:start + 900])}, token)
        upload = "https://upload-firebasehosting.googleapis.com/upload/" + version + "/files"
        require(result.get("uploadUrl") in (None, upload), "Unexpected Hosting upload URL")
        for digest in result.get("uploadRequiredHashes", []):
            require(digest in bodies, "Hosting requested an unrelated file")
            if digest not in uploaded:
                write("Upload approved Hosting asset", upload + "/" + digest, "POST", bodies[digest], token,
                      "application/octet-stream")
                uploaded.add(digest)
    write("Finalize Hosting version", HOSTING_API + version + "?update_mask=status", "PATCH",
          {"status": "FINALIZED"}, token)
    return version, proposed


def verify_hosting_version(version, config, manifest, token):
    record = get("Read Hosting version", HOSTING_API + version, token)
    require(record.get("status") == "FINALIZED" and record.get("config") == config,
            "Hosting version configuration mismatch")
    found, cursor, seen = {}, "", set()
    while True:
        query = urllib.parse.urlencode({"pageSize": 1000, **({"pageToken": cursor} if cursor else {})})
        page = get("Read Hosting files", HOSTING_API + version + "/files?" + query, token)
        for item in page.get("files", []):
            require(item["path"] not in found and item.get("status") == "ACTIVE", "Invalid Hosting file")
            found[item["path"]] = item["hash"]
        cursor = page.get("nextPageToken", "")
        if not cursor:
            break
        require(cursor not in seen, "Repeated Hosting page token")
        seen.add(cursor)
    require(found == manifest, "Hosting manifest mismatch")


def deploy_rules(content, rollback, token):
    ruleset = write("Create PR614 Rules ruleset", RULES_API + f"projects/{PROJECT}/rulesets", "POST",
                    {"source": {"files": [{"name": "firestore.rules", "content": content}]}}, token)["name"]
    require(re.fullmatch(rf"projects/{PROJECT}/rulesets/[A-Za-z0-9-]+", ruleset), "Unexpected Rules ruleset")
    release_name = rollback["release"]
    updated = write("Activate PR614 Rules", RULES_API + release_name, "PATCH",
                    {"release": {"name": release_name, "rulesetName": ruleset},
                     "updateMask": "rulesetName"}, token)
    require(updated.get("rulesetName") == ruleset, "Firestore Rules release mismatch")
    return ruleset


def deployed_source(name, config, token):
    if FUNCTIONS[name] == 1:
        return inventory.source_archive(name, 1, config["function"], token)[0]
    return inventory.signed_source(name, "v2alpha", {}, token, gen2_functions=tuple(
        key for key, generation in FUNCTIONS.items() if generation == 2))


def package():
    guard(os.environ)
    require(set(ENTRY_POINTS) == set(FUNCTIONS) and "createAthleteFromIntakeCall" not in FUNCTIONS,
            "Unexpected Function scope")
    root = Path("pr614-candidate/functions")
    metadata = json.loads((root / "package.json").read_text())
    metadata["main"] = "index.js"
    metadata.pop("scripts", None)
    index = 'require("firebase-admin").initializeApp();\n' + "".join(
        f'exports.{name}=require("./{path}").{name};\n' for name, path in ENTRY_POINTS.items())
    pending, included = list(ENTRY_POINTS.values()), set()
    output = Path(os.environ["CANDIDATE_PACKAGE"])
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
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
            for dependency in re.findall(r'''require\(["'](\.[^"']+)["']\)''', source):
                resolved = (root / path).parent / dependency
                options = [resolved, Path(str(resolved) + ".js"), Path(str(resolved) + ".json"), resolved / "index.js"]
                local = next((item.resolve() for item in options if item.is_file()), None)
                require(local is not None and local.is_relative_to((root / "lib").resolve()),
                        f"Cannot package dependency {dependency} from {path}")
                pending.append(local.relative_to(root.resolve()).as_posix())
    with tempfile.TemporaryDirectory() as directory:
        with zipfile.ZipFile(output) as archive:
            archive.extractall(directory)
        subprocess.run(["node", "-e",
            "const e=require(process.argv[1]);if(JSON.stringify(Object.keys(e).sort())!==process.argv[2]||Object.values(e).some(f=>typeof f!==\"function\"))process.exit(1)",
            directory, json.dumps(sorted(FUNCTIONS), separators=(",", ":"))],
            env={**os.environ, "NODE_PATH": str((root / "node_modules").resolve())}, check=True)


def main():
    guard(os.environ)
    require(subprocess.check_output(["git", "-C", "pr614-candidate", "rev-parse", "HEAD"], text=True).strip() == SHA,
            "Candidate SHA mismatch")
    evidence = json.loads(Path("pr614-preflight.json").read_text())
    require(not evidence.get("errors") and set(evidence.get("functions", {})) == set(FUNCTIONS),
            "Corrected PR614 preflight did not pass exact Function scope")
    hosting_before = evidence["hostingRollback"]
    rules_before = evidence["firestoreRollback"]
    require(hosting_before["release"] == os.environ["EXPECTED_HOSTING_RELEASE"] and
            hosting_before["version"] == os.environ["EXPECTED_HOSTING_VERSION"],
            "Hosting baseline differs from owner-approved inputs")
    archive = Path(os.environ["CANDIDATE_PACKAGE"]).read_bytes()
    inventory.archive_evidence(archive)
    function_token = inventory.command("Acquire Function credentials", ["gcloud", "auth", "print-access-token"]).decode().strip()
    platform_token = inventory.hosting_access_token(os.environ)
    configs = {name: release.function_config(name, function_token) for name in FUNCTIONS}
    for name, config in configs.items():
        record, approved = config["function"], evidence["functions"][name]["configuration"]
        require(record.get("updateTime") == approved.get("updateTime") and
                record.get("versionId") == approved.get("versionId") and
                (record.get("entryPoint") or record.get("buildConfig", {}).get("entryPoint")) == name,
                f"{name}: baseline differs from corrected preflight")
    live_hosting = current_hosting(platform_token, Path("pr614-candidate/public" + ASSETS[0]).read_bytes())
    require(live_hosting["release"] == hosting_before["release"] and live_hosting["version"] == hosting_before["version"] and
            live_hosting["manifest"] == hosting_before["manifest"] and live_hosting["config"] == hosting_before["config"],
            "Hosting changed after preflight")
    current_rules = get("Recheck Firestore Rules release", RULES_API + rules_before["release"], platform_token)
    require(current_rules.get("rulesetName") == rules_before["ruleset"], "Firestore Rules changed after preflight")
    version, proposed = prepare_hosting(hosting_before, platform_token)
    verify_hosting_version(version, hosting_before["config"], proposed, platform_token)
    updated = []
    try:
        for name, before in configs.items():
            require(release.function_config(name, function_token) == before, f"{name}: changed before update")
            updated.append(name)
            release.source_update(name, archive, function_token)
            after = release.function_config(name, function_token)
            require(release.runtime_config(after) == release.runtime_config(before),
                    f"{name}: runtime identity, IAM, secrets, or transport changed")
            require(inventory.sha(deployed_source(name, after, function_token)) == inventory.sha(archive),
                    f"{name}: deployed source differs from reviewed package")
        ruleset = deploy_rules(Path("pr614-candidate/firestore.rules").read_text(), rules_before, platform_token)
        active_rules = get("Verify active PR614 Rules", RULES_API + rules_before["release"], platform_token)
        require(active_rules.get("rulesetName") == ruleset, "PR614 Rules are not active")
        verify_hosting_version(version, hosting_before["config"], proposed, platform_token)
        query = urllib.parse.urlencode({"versionName": version})
        hosting_release = write("Publish PR614 Hosting overlay", HOSTING_API + SITE + "/releases?" + query,
                                "POST", {}, platform_token)["name"]
        latest = get("Verify active Hosting release", HOSTING_API + SITE + "/releases?pageSize=1", platform_token)
        require(latest["releases"][0]["name"] == hosting_release and
                latest["releases"][0]["version"]["name"] == version, "Hosting overlay not active")
        for path in ASSETS:
            live = inventory.read("Read live PR614 Hosting asset",
                f"https://{PROJECT}.web.app{path}?" + urllib.parse.urlencode({"release": hosting_release}))
            require(inventory.sha(live) == inventory.sha(Path("pr614-candidate/public" + path).read_bytes()),
                    f"Live Hosting asset differs: {path}")
    except Exception:
        print(json.dumps({"STOP_NO_RETRY": True, "updatedFunctions": updated,
                          "rulesRollback": rules_before["ruleset"], "hostingRollback": hosting_before["version"],
                          "preparedHostingVersion": version}), flush=True)
        raise
    result = {"applicationSha": SHA, "functions": list(FUNCTIONS), "excluded": "createAthleteFromIntakeCall",
              "ruleset": ruleset, "rulesRollback": rules_before["ruleset"], "hostingRelease": hosting_release,
              "hostingVersion": version, "hostingRollback": hosting_before["version"], "assets": list(ASSETS)}
    Path("pr614-deploy-result.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    if sys.argv[1:] == ["--guard-only"]:
        guard(os.environ)
    elif sys.argv[1:] == ["--package"]:
        package()
    else:
        require(not sys.argv[1:], "Unexpected release argument")
        main()
