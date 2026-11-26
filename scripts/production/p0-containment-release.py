"""One approved P0 production containment release; never retries or auto-rolls back."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

PROJECT, SITE = "sandmandashboard", "sandman-main"
H = "https://firebasehosting.googleapis.com/v1beta1/"
R = "https://firebaserules.googleapis.com/v1/"
FIRESTORE = f"projects/{PROJECT}/releases/cloud.firestore"
STORAGE = f"projects/{PROJECT}/releases/firebase.storage/{PROJECT}.firebasestorage.app"
RUN = 45736128430
ARTIFACT = 15079377212
ARCHIVE_SHA = "6183bc17e03da83957980db1b5d100ca18d81a54a4f3cb1344426995fe340aa1"
RULES_SHA = "348796c0e70a4254ef7b9a3cf8ac37ce0fb944f4f1bae2d1f4f52dd950c8b74b"
RULES_BASE = "d663ac2354e243e4d6aae7e4d799241c5c20763a60e93a79c2d7cf813fb180af"
STORAGE_SHA = "ed10206af6e9b728e394ae422f8ac963f411c37a8ca5e1737e89925b3f9b1f82"
BASE_RELEASE = f"sites/{SITE}/releases/1795535517238000"
BASE_VERSION = f"sites/{SITE}/versions/31b54c62ffbf9cff"
BASE_RULESET = f"projects/{PROJECT}/rulesets/dd8727d6-4476-4c1d-baaf-21fba3ccbd5b"
ASSETS = set("""
/assets/js/coaches-ceremonies.js
/assets/js/scoped-coach-athletes.js
/coaches/arena-xp/championship-arena.js
/coaches/arena-xp/declared-championship.js
/coaches/arena-xp/duel-arena.js
/coaches/arena-xp/weekend-arena.js
/coaches/ceremonies/certificates/queue.js
/coaches/command-center/command-center.js
/coaches/daily-xp/daily-grind.js
/coaches/lanes/strength/review.js
/coaches/progression/queue.js
/coaches/roster/roster.js
/coaches/safety/safety.js
/coaches/testing/testing-operations.js
/coaches/today/today.js
/communications/coach/hub.js
/connect/proposals/activity/activity.js
/intake-coach/coach.intake.js
/athletes/hub/index.html
/athletes/hub/mini-hub.html
/assets/js/athlete-nav.js
/assets/js/athlete-self-context.js
""".split())
PERMISSIONS = set("""
firebasehosting.sites.get firebasehosting.sites.update
firebaserules.releases.get firebaserules.releases.update
firebaserules.rulesets.create firebaserules.rulesets.get
""".split())
OUT = Path("p0-production-release-evidence")
RESULT = {"status": "STOP_NO_RETRY", "project": PROJECT, "site": SITE,
          "preflightRun": RUN, "preflightArtifact": ARTIFACT,
          "preflightArtifactSha256": ARCHIVE_SHA,
          "rollbackHostingVersion": BASE_VERSION, "previousRuleset": BASE_RULESET,
          "storageAuthenticatedDependencies": "PENDING"}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(body):
    return hashlib.sha256(body).hexdigest()


def object_sha(obj):
    return sha(json.dumps(obj, sort_keys=True).encode())


def save():
    OUT.mkdir(exist_ok=True)
    (OUT / "release.json").write_text(json.dumps(RESULT, indent=2) + "\n")


def guard():
    expected = {
        "GITHUB_REPOSITORY": "raulsandoval81-maker/SandmanSystem",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": "raulsandoval81-maker/SandmanSystem/.github/workflows/p0-production-containment-release.yml@refs/heads/main",
        "GITHUB_RUN_ATTEMPT": "1",
        "CONFIRM_PROJECT": PROJECT,
        "APPROVAL": "APPROVE_P0_PRODUCTION_RUN_45736128430",
    }
    for key, value in expected.items():
        require(os.environ.get(key) == value, "Guard rejected " + key)


def read_package():
    raw = Path("p0-preflight.zip").read_bytes()
    require(sha(raw) == ARCHIVE_SHA, "Preflight archive digest mismatch")
    with zipfile.ZipFile(Path("p0-preflight.zip")) as z:
        expected = {"candidate.json", "production-preflight.json", "hosting-manifest.json",
                    "hosting-config.json", "production.firestore.rules"} | {"public" + p for p in ASSETS}
        names = [i.filename for i in z.infolist() if not i.is_dir()]
        require(len(names) == len(expected) and set(names) == expected, "Unexpected archive content")
        candidate = json.loads(z.read("candidate.json"))
        pre = json.loads(z.read("production-preflight.json"))
        manifest = json.loads(z.read("hosting-manifest.json"))
        config = json.loads(z.read("hosting-config.json"))
        rules = z.read("production.firestore.rules")
        data = {p: z.read("public" + p) for p in ASSETS}
    require(pre["status"] == "PASS" and pre["project"] == PROJECT and pre["site"] == SITE
            and not pre["conflicts"], "Preflight not cleared")
    require(pre["candidate"] == candidate and candidate["status"] == "CANDIDATE_VERIFIED"
            and candidate["stagingAcceptanceRun"] == 45732572092
            and candidate["stagingAcceptanceSource"] == "f2bf002c46e21c4ba0dcc3a3bd24b92d0ae6c9fa"
            and candidate["stagingAuthenticatedChecks"] == "11/11"
            and candidate["isolatedWriteTests"] == "19/19", "Acceptance pin mismatch")
    require(sha(rules) == candidate["productionRulesSha256"] == RULES_SHA, "Rules digest mismatch")
    require(set(candidate["assets"]) == ASSETS and all(sha(data[p]) == candidate["assets"][p]["sha256"] for p in ASSETS),
            "Candidate asset digest mismatch")
    hb = pre["hostingBaseline"]
    require(hb["release"] == BASE_RELEASE and hb["version"] == BASE_VERSION
            and hb["fileCount"] == len(manifest) == 3066
            and object_sha(manifest) == hb["manifestSha256"] == "bc38149193ed90d411969debf5f456e200ba0b43a089c449d99229aa4e84bead"
            and object_sha(config) == hb["configSha256"] == "f217b2948f595e1c3be57de5ffa4886eea70a2661a1230e04a62d35fb7ca3839",
            "Hosting baseline pin mismatch")
    require(set(hb["assets"]) == ASSETS and all(hb["assets"][p]["state"] in ("BASELINE_MATCHES", "ALREADY_MATCHES")
            and hb["assets"][p]["hostingHash"] == manifest.get(p) for p in ASSETS), "Conflicting asset baseline")
    require(pre["firestoreBaseline"] == {"release": FIRESTORE, "ruleset": BASE_RULESET, "sha256": RULES_BASE},
            "Firestore baseline pin mismatch")
    require(pre["storageRevision"]["release"] == STORAGE and pre["storageRevision"]["sha256"] == STORAGE_SHA,
            "Storage pin mismatch")
    require(set(pre["permissions"]["granted"]) == PERMISSIONS and not pre["permissions"]["missing"], "Permission evidence mismatch")
    return pre, manifest, config, rules, data


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def release():
    guard()
    pre, manifest, config, rules, data = read_package()
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    require(bool(token), "No authenticated token")
    opener = urllib.request.build_opener(NoRedirect())

    def call(url, method="GET", payload=None, content_type="application/json"):
        body = None if payload is None else payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        req = urllib.request.Request(url, data=body, method=method,
              headers={"Authorization": "Bearer " + token, "Content-Type": content_type})
        with opener.open(req, timeout=60) as response:
            raw = response.read()
            if not raw:
                return {}
            if content_type == "application/octet-stream":
                return {}
            return json.loads(raw)

    def write(label, url, method, payload, content_type="application/json"):
        RESULT["lastOperation"] = label
        save()
        return call(url, method, payload, content_type)

    def active_hosting():
        a = call(H + f"sites/{SITE}/releases?pageSize=1")["releases"][0]
        return a["name"], a["version"]["name"]

    def active_rules(name):
        r = call(R + name)
        require(r["name"] == name and re.fullmatch(rf"projects/{PROJECT}/rulesets/[A-Za-z0-9-]+", r["rulesetName"]),
                "Unexpected rules identity")
        files = call(R + r["rulesetName"])["source"]["files"]
        require(len(files) == 1, "Unexpected rule source count")
        return {"release": name, "ruleset": r["rulesetName"], "sha256": sha(files[0]["content"].encode())}

    def verify_version(version, expected):
        record = call(H + version)
        require(record["status"] == "FINALIZED" and record["config"] == config, "Hosting configuration drift")
        found, cursor, seen = {}, "", set()
        while True:
            q = urllib.parse.urlencode({"pageSize": 1000, **({"pageToken": cursor} if cursor else {})})
            page = call(H + version + "/files?" + q)
            for entry in page.get("files", []):
                require(entry["path"] not in found and entry["status"] == "ACTIVE", "Invalid Hosting manifest entry")
                found[entry["path"]] = entry["hash"]
            cursor = page.get("nextPageToken", "")
            if not cursor:
                break
            require(cursor not in seen, "Repeated manifest cursor")
            seen.add(cursor)
        require(found == expected, "Hosting manifest drift")

    def check_rules_baselines():
        require(active_rules(FIRESTORE) == pre["firestoreBaseline"], "Firestore changed since preflight")
        require(active_rules(STORAGE) == pre["storageRevision"], "Storage changed since preflight")

    def check_active_baselines():
        require(active_hosting() == (BASE_RELEASE, BASE_VERSION), "Hosting changed since preflight")
        check_rules_baselines()

    metadata = call("https://firebase.googleapis.com/v1beta1/projects/" + PROJECT)
    require(metadata["projectId"] == PROJECT and str(metadata["projectNumber"]) == "889326401061", "Wrong project")
    p = call(f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}:testIamPermissions",
             "POST", {"permissions": sorted(PERMISSIONS)})
    require(set(p.get("permissions", [])) == PERMISSIONS, "Deployment permissions changed")
    check_active_baselines()
    verify_version(BASE_VERSION, manifest)
    for path in ASSETS:
        if path not in manifest:
            continue
        request = urllib.request.Request("https://sandman-main.web.app" + path + "?p0=" + os.environ["GITHUB_RUN_ID"],
                                         headers={"Cache-Control": "no-cache"})
        with opener.open(request, timeout=20) as response:
            require(response.status == 200 and sha(response.read()) == pre["hostingBaseline"]["assets"][path]["sha256"],
                    "Serving baseline drift: " + path)

    bodies, hashes = {}, {}
    for path, data_bytes in data.items():
        body = subprocess.run(["node", "-e", "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0),{mtime:0}))"],
                              input=data_bytes, capture_output=True, check=True, timeout=30).stdout
        digest = sha(body)
        bodies[digest], hashes[path] = body, digest
    require(set(hashes) - set(manifest) == {"/assets/js/scoped-coach-athletes.js"}, "Unexpected new path")
    proposed = {**manifest, **hashes}
    changed = {p for p in proposed if proposed[p] != manifest.get(p)}
    require(len(proposed) == 3067 and changed <= ASSETS, "Unexpected Hosting overlay scope")
    RESULT.update(verifiedBaseline=True, permissionCount=len(PERMISSIONS), changedPaths=sorted(changed),
                  preservedUnrelatedFiles=len(set(manifest) - ASSETS))
    (OUT / "baseline-manifest.json").write_text(json.dumps(manifest, sort_keys=True) + "\n")
    (OUT / "baseline-config.json").write_text(json.dumps(config, sort_keys=True) + "\n")
    save()

    check_active_baselines()
    version = write("Create production Hosting version", H + f"sites/{SITE}/versions", "POST", {"config": config})["name"]
    require(re.fullmatch(rf"sites/{SITE}/versions/[\w-]+", version), "Unexpected prepared Hosting version")
    RESULT["preparedHostingVersion"] = version
    save()
    upload = f"https://upload-firebasehosting.googleapis.com/upload/{version}/files"
    entries, uploaded = sorted(proposed.items()), set()
    for i in range(0, len(entries), 900):
        response = write("Populate approved Hosting manifest", H + version + ":populateFiles", "POST",
                         {"files": dict(entries[i:i + 900])})
        require(response.get("uploadUrl") in (None, upload), "Unexpected upload URL")
        for digest in response.get("uploadRequiredHashes", []):
            require(digest in bodies, "Unrelated upload required")
            if digest not in uploaded:
                write("Upload approved asset", upload + "/" + digest, "POST", bodies[digest], "application/octet-stream")
                uploaded.add(digest)
    write("Finalize Hosting version", H + version + "?update_mask=status", "PATCH", {"status": "FINALIZED"})
    verify_version(version, proposed)

    ruleset = write("Create approved Firestore ruleset", R + f"projects/{PROJECT}/rulesets", "POST",
                    {"source": {"files": [{"name": "firestore.rules", "content": rules.decode()}]}})["name"]
    require(re.fullmatch(rf"projects/{PROJECT}/rulesets/[A-Za-z0-9-]+", ruleset), "Unexpected ruleset identity")
    RESULT["preparedRuleset"] = ruleset
    save()
    files = call(R + ruleset)["source"]["files"]
    require(len(files) == 1 and sha(files[0]["content"].encode()) == RULES_SHA, "Prepared rules digest mismatch")
    check_active_baselines()
    release_name = write("Publish approved Hosting overlay", H + f"sites/{SITE}/releases?" +
                         urllib.parse.urlencode({"versionName": version}), "POST", {})["name"]
    require(re.fullmatch(rf"sites/{SITE}/releases/[0-9]+", release_name), "Unexpected Hosting release")
    RESULT["hostingRelease"] = release_name
    save()
    require(active_hosting() == (release_name, version), "Hosting release not active")
    for path in ASSETS:
        request = urllib.request.Request("https://sandman-main.web.app" + path + "?" +
            urllib.parse.urlencode({"release": release_name}), headers={"Cache-Control": "no-cache"})
        with opener.open(request, timeout=20) as response:
            require(response.status == 200 and sha(response.read()) == sha(data[path]), "Published asset mismatch: " + path)
    RESULT["verifiedHostingAssets"] = len(ASSETS)
    save()
    check_rules_baselines()
    require(active_hosting() == (release_name, version), "Hosting changed before rule activation")
    write("Activate approved Firestore rules", R + FIRESTORE, "PATCH",
          {"release": {"name": FIRESTORE, "rulesetName": ruleset}, "updateMask": "rulesetName"})
    require(active_rules(FIRESTORE) == {"release": FIRESTORE, "ruleset": ruleset, "sha256": RULES_SHA},
            "Active Firestore digest mismatch")
    require(active_hosting() == (release_name, version), "Hosting changed during rule activation")
    verify_version(version, proposed)
    require(active_rules(STORAGE) == pre["storageRevision"], "Storage changed during release")
    RESULT.update(status="PASS", activeRuleset=ruleset, activeRulesSha256=RULES_SHA, hostingVersion=version,
                  liveAuthenticatedOS="PENDING_OWNER_SMOKE_TEST", temporaryIamCleanup="PENDING_OWNER_REMOVAL")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["--verify-package"]:
            read_package()
            print("Exact preflight package verified")
        else:
            require(not sys.argv[1:], "Unexpected argument")
            save()
            release()
    finally:
        if not sys.argv[1:]:
            save()
            print(json.dumps(RESULT, sort_keys=True), flush=True)
