"""Package-specific staging inventory. This program has no deployment operations."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.parse
import urllib.request

inventory = __import__("pr606-readonly-preflight")
permissions = __import__("pr614-readonly-preflight")
PROJECT = "sandman-combat-staging"
SOURCE = "00379c6cd9da199a59bc7635d7609034b135b227"
PACKAGE = "8ee5c8784d3fff13c449c7dc64465c3e4fec7b51b84d1b910d0abc337fd5a766"
PATCH = "19adc2bc32718d0e14fd686d6407521e2c46dec86c026fda2964e1ded1f06254"
RULES = "b0e7dd8c633c13eccc64cb66edb357141c20d98c92c03b947607f3737a357da6"
BASELINE = "8cf0f6033f2afec0a8cb5929eaea95837e404553337a4f5f7e074fb0c49b780d"
INPUT = Path(__file__).resolve().parent / "p0-containment"
ROOT = Path("p0-candidate")
ASSETS = (
    "public/assets/js/coaches-ceremonies.js",
    "public/assets/js/scoped-coach-athletes.js",
    "public/coaches/arena-xp/championship-arena.js",
    "public/coaches/arena-xp/declared-championship.js",
    "public/coaches/arena-xp/duel-arena.js",
    "public/coaches/arena-xp/weekend-arena.js",
    "public/coaches/ceremonies/certificates/queue.js",
    "public/coaches/command-center/command-center.js",
    "public/coaches/daily-xp/daily-grind.js",
    "public/coaches/lanes/strength/review.js",
    "public/coaches/progression/queue.js",
    "public/coaches/roster/roster.js",
    "public/coaches/safety/safety.js",
    "public/coaches/testing/testing-operations.js",
    "public/coaches/today/today.js",
    "public/communications/coach/hub.js",
    "public/connect/proposals/activity/activity.js",
    "public/intake-coach/coach.intake.js",
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args]).decode().strip()


def candidate():
    patch = INPUT / "client.patch"
    rules = INPUT / "firestore.rules"
    assert git("rev-parse", "HEAD") == SOURCE, "Unexpected candidate source"
    assert not git("status", "--porcelain"), "Candidate checkout is dirty"
    assert digest(patch.read_bytes()) == PATCH, "Client patch mismatch"
    assert digest(rules.read_bytes()) == RULES, "Firestore candidate mismatch"
    git("apply", "--index", str(patch))
    expected = {*ASSETS, "tests/browser/enrollment-activity-pathways.test.mjs"}
    assert set(git("diff", "--cached", "--name-only").splitlines()) == expected, "Unexpected patch paths"
    assets = {}
    for path in ASSETS:
        data = (ROOT / path).read_bytes()
        compressed = subprocess.run(
            ["node", "-e", "process.stdout.write(require('zlib').gzipSync(require('fs').readFileSync(0)))"],
            input=data, capture_output=True, check=True, timeout=15,
        ).stdout
        assets[path.removeprefix("public")] = {"sha256": digest(data), "hostingHash": digest(compressed)}
    return {"archiveSha256": PACKAGE, "source": SOURCE, "firestoreSha256": RULES, "assets": assets}


def live(result):
    token = inventory.hosting_access_token(os.environ)
    opener = urllib.request.build_opener(inventory.NoRedirect())

    def get(url):
        request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
        with opener.open(request, timeout=30) as response:
            return json.load(response)

    project = get(f"https://firebase.googleapis.com/v1beta1/projects/{PROJECT}")
    assert project.get("projectId") == PROJECT and str(project.get("projectNumber")) == "991554514268"
    required = sorted(set(permissions.REQUIREMENTS["hosting"] + permissions.REQUIREMENTS["rules"]))
    probe = permissions.permission_probe("P0 staging project",
        f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT}", token, required)
    result["permissions"] = probe
    assert not probe["missing"], f"Missing staging permissions: {probe['missing']}"

    rules_api = "https://firebaserules.googleapis.com/v1/"
    release_url = rules_api + f"projects/{PROJECT}/releases/cloud.firestore"
    release = get(release_url)
    ruleset = release["rulesetName"]
    assert re.fullmatch(rf"projects/{PROJECT}/rulesets/[A-Za-z0-9-]+", ruleset)
    files = get(rules_api + ruleset)["source"]["files"]
    assert len(files) == 1
    live_hash = digest(files[0]["content"].encode())
    result["firestoreBaseline"] = {"release": release["name"], "ruleset": ruleset, "sha256": live_hash}
    assert live_hash == BASELINE, "Verified staging Firestore baseline drift"

    hosting_api = "https://firebasehosting.googleapis.com/v1beta1/"
    releases_url = hosting_api + f"sites/{PROJECT}/releases?pageSize=1"
    active = get(releases_url)["releases"][0]
    version = active["version"]["name"]
    assert re.fullmatch(rf"sites/{PROJECT}/releases/[0-9]+", active["name"])
    assert re.fullmatch(rf"sites/{PROJECT}/versions/[A-Za-z0-9_-]+", version)
    config = get(hosting_api + version)
    assert config.get("status") == "FINALIZED" and isinstance(config.get("config"), dict)
    manifest = {}
    cursors = set()
    cursor = ""
    while True:
        qs = urllib.parse.urlencode({"pageSize": 1000, **({"pageToken": cursor} if cursor else {})})
        page = get(hosting_api + version + "/files?" + qs)
        for item in page.get("files", []):
            path, value = item["path"], item["hash"]
            assert path.startswith("/") and path not in manifest and re.fullmatch(r"[a-f0-9]{64}", value)
            assert item.get("status") == "ACTIVE"
            manifest[path] = value
        cursor = page.get("nextPageToken")
        if not cursor:
            break
        assert cursor not in cursors, "Repeated Hosting page token"
        cursors.add(cursor)
    assert manifest, "Empty Hosting manifest"
    assert get(releases_url)["releases"][0]["name"] == active["name"], "Hosting drift during read"
    assert get(release_url)["rulesetName"] == ruleset, "Firestore drift during read"
    result["hostingBaseline"] = {
        "release": active["name"], "version": version, "fileCount": len(manifest),
        "manifestSha256": digest(json.dumps(manifest, sort_keys=True).encode()),
        "configSha256": digest(json.dumps(config["config"], sort_keys=True).encode()),
        "allowlistedPaths": {path: manifest.get(path) for path in result["assets"]},
    }


if __name__ == "__main__":
    if sys.argv[1:] == ["--candidate-only"]:
        Path("p0-preflight-candidate.json").write_text(json.dumps(candidate(), indent=2) + "\n")
    elif not sys.argv[1:]:
        result = json.loads(Path("p0-preflight-candidate.json").read_text())
        try:
            live(result)
            result["status"] = "PASS"
        finally:
            Path("p0-preflight-live.json").write_text(json.dumps(result, indent=2) + "\n")
    else:
        sys.exit("Unexpected argument")
