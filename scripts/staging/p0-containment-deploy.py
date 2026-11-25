"""Protected, single-attempt Hosting and Firestore release from run #456."""
import json
import os
from pathlib import Path
import re
import urllib.parse

preflight = __import__("p0-containment-preflight")
platform = __import__("pr614-staging-deploy")
inventory = preflight.inventory
require = inventory.require
PROJECT = preflight.PROJECT
SITE = platform.SITE
HOSTING_API = platform.HOSTING_API
RULES_API = platform.RULES_API
EVIDENCE = Path("p0-staging-deploy-evidence.json")
RUN_456_SHA = "697d1f2157fe5b1c7d28a567d3b7543a12dec912a87e5a64a3ae7b48b5906193"


def guard(env):
    for key, expected in {
        "GITHUB_REPOSITORY": inventory.REPO,
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_WORKFLOW_REF": inventory.WORKFLOW,
        "REQUESTED_ACTION": "p0-containment-staging-deploy",
        "CONFIRM_PROJECT": PROJECT,
        "APPROVAL": "APPROVE_P0_STAGING_RUN_456",
    }.items():
        require(env.get(key) == expected, f"Unexpected {key}")


def overlay(manifest, assets):
    new_helper = "/assets/js/scoped-coach-athletes.js"
    require(len(manifest) == 3073 and len(assets) == 18, "Unexpected release scope")
    require(set(assets) - set(manifest) == {new_helper}, "Unexpected new Hosting path")
    proposed = {**manifest, **assets}
    require(len(proposed) == 3074, "Unexpected proposed manifest size")
    require({p for p in proposed if proposed[p] != manifest.get(p)} == set(assets),
            "Unexpected Hosting changes")
    return proposed


def main(evidence):
    guard(os.environ)
    pin = (preflight.INPUT / "run-456.json").read_bytes()
    require(preflight.digest(pin) == RUN_456_SHA, "Run #456 evidence mismatch")
    approved = json.loads(pin)
    require(approved["status"] == "PASS" and not approved["permissions"]["missing"],
            "Run #456 failed")
    actual = preflight.candidate()
    require(all(actual[key] == approved[key] for key in actual), "Candidate differs from run #456")
    config, manifest = preflight.live(actual, check_permissions=False)
    for field in ("hostingBaseline", "firestoreBaseline"):
        require(actual[field] == approved[field], f"Run #456 {field} drift")
    evidence["baselines"] = {key: actual[key] for key in ("hostingBaseline", "firestoreBaseline")}
    bodies, hashes = {}, {}
    for path, asset in actual["assets"].items():
        body = platform.gzip((preflight.ROOT / ("public" + path)).read_bytes())
        digest = preflight.digest(body)
        require(digest == asset["hostingHash"], f"Hosting payload mismatch: {path}")
        bodies[digest], hashes[path] = body, digest
    proposed = overlay(manifest, hashes)
    token = inventory.hosting_access_token(os.environ)

    def put(operation, url, method, payload, content_type="application/json"):
        evidence["lastOperation"] = operation
        EVIDENCE.write_text(json.dumps(evidence, indent=2) + "\n")
        return platform.write(operation, url, method, payload, token, content_type)

    def verify_active(field, expected):
        if field == "hosting":
            url = HOSTING_API + SITE + "/releases?pageSize=1"
            record = platform.get("Read active Hosting", url, token)["releases"][0]
            require((record["name"], record["version"]["name"]) == expected, "Active Hosting drift")
        else:
            url = RULES_API + approved["firestoreBaseline"]["release"]
            record = platform.get("Read active Firestore", url, token)
            require(record["rulesetName"] == expected, "Active Firestore drift")

    baseline = approved["hostingBaseline"]
    rules_baseline = approved["firestoreBaseline"]
    verify_active("hosting", (baseline["release"], baseline["version"]))
    verify_active("rules", rules_baseline["ruleset"])
    version = put("Create staging Hosting version", HOSTING_API + SITE + "/versions",
                  "POST", {"config": config})["name"]
    require(re.fullmatch(rf"{SITE}/versions/[\w-]+", version), "Unexpected Hosting version")
    evidence["preparedHostingVersion"] = version
    upload = f"https://upload-firebasehosting.googleapis.com/upload/{version}/files"
    uploaded = set()
    entries = sorted(proposed.items())
    for start in range(0, len(entries), 900):
        result = put("Populate staging Hosting version", HOSTING_API + version + ":populateFiles",
                     "POST", {"files": dict(entries[start:start + 900])})
        require(result.get("uploadUrl") in (None, upload), "Unexpected Hosting upload URL")
        for digest in result.get("uploadRequiredHashes", []):
            require(digest in bodies, "Unrelated Hosting upload requested")
            if digest not in uploaded:
                put("Upload approved staging asset", f"{upload}/{digest}", "POST", bodies[digest],
                    "application/octet-stream")
                uploaded.add(digest)
    put("Finalize staging Hosting version", HOSTING_API + version + "?update_mask=status",
        "PATCH", {"status": "FINALIZED"})
    platform.verify_hosting_version(version, config, proposed, token)

    ruleset = put("Create staging Firestore ruleset", RULES_API + f"projects/{PROJECT}/rulesets", "POST",
                  {"source": {"files": [{"name": "firestore.rules", "content":
                      (preflight.INPUT / "firestore.rules").read_bytes().decode()}]}})["name"]
    require(re.fullmatch(rf"projects/{PROJECT}/rulesets/[A-Za-z0-9-]+", ruleset),
            "Unexpected Firestore ruleset")
    evidence["preparedRuleset"] = ruleset
    stored_rules = platform.get("Read prepared Firestore ruleset", RULES_API + ruleset, token)
    files = stored_rules["source"]["files"]
    require(len(files) == 1 and preflight.digest(files[0]["content"].encode()) == preflight.RULES,
            "Prepared Firestore ruleset differs from approved bytes")

    verify_active("hosting", (baseline["release"], baseline["version"]))
    verify_active("rules", rules_baseline["ruleset"])
    release = put("Publish staging Hosting overlay",
                  HOSTING_API + SITE + "/releases?" + urllib.parse.urlencode({"versionName": version}),
                  "POST", {})["name"]
    evidence["hostingRelease"] = release
    verify_active("hosting", (release, version))
    for path, asset in actual["assets"].items():
        url = f"https://{PROJECT}.web.app{path}?" + urllib.parse.urlencode({"release": release})
        data = inventory.read("Verify live staging Hosting asset", url)
        require(preflight.digest(data) == asset["sha256"], f"Published Hosting asset mismatch: {path}")

    verify_active("rules", rules_baseline["ruleset"])
    rules_url = RULES_API + rules_baseline["release"]
    put("Activate staging Firestore ruleset", rules_url, "PATCH",
        {"release": {"name": rules_baseline["release"], "rulesetName": ruleset}, "updateMask": "rulesetName"})
    verify_active("rules", ruleset)
    verify_active("hosting", (release, version))
    evidence.update(status="PASS", activeRuleset=ruleset)


if __name__ == "__main__":
    result = {"status": "STOP_NO_RETRY", "project": PROJECT, "preflightRun": 45675073459}
    try:
        main(result)
    finally:
        EVIDENCE.write_text(json.dumps(result, indent=2) + "\n")
