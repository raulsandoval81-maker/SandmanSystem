"""Read-only Run #339 reconciliation against the sanitized Run #333 baseline."""
import importlib.util
import json
import os
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("release", HERE / "pr606-cash-check-deploy.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
inventory = release.inventory
BASE = Path("evidence/run333")
OUT = Path("evidence/run339/snapshot.json")
PREPARED = f"{release.SITE}/versions/8f33ab588a8c7fdd"
ORIGINAL = "sendproposalprepaidcashreceipt-00002-8v7"
MISSING = object()

GENERATED = {
    "/function/updateTime", "/function/versionId", "/function/buildId", "/function/buildName",
    *(f"/transport/run/{key}" for key in (
        "etag", "generation", "observedGeneration", "updateTime", "latestCreatedRevision",
        "latestReadyRevision")),
}
SOURCE = {"/function/sourceArchiveUrl", "/function/buildConfig/build",
          "/function/buildConfig/source", "/function/buildConfig/sourceProvenance"}


def classify(path):
    if path in GENERATED:
        return "generated metadata"
    if any(path == prefix or path.startswith(prefix + "/") for prefix in SOURCE):
        return "expected source-deployment behavior"
    return "potential material drift; review required"


def changes(old, new, path=""):
    if type(old) is type(new) and old == new:
        return []
    if isinstance(old, dict) or isinstance(new, dict):
        if (old is MISSING or isinstance(old, dict)) and (new is MISSING or isinstance(new, dict)):
            a, b = {} if old is MISSING else old, {} if new is MISSING else new
            keys = sorted(set(a) | set(b))
            if keys:
                return [item for key in keys for item in changes(
                    a.get(key, MISSING), b.get(key, MISSING),
                    path + "/" + key.replace("~", "~0").replace("/", "~1"))]
    if isinstance(old, list) and isinstance(new, list):
        return [item for i in range(max(len(old), len(new))) for item in changes(
            old[i] if i < len(old) else MISSING, new[i] if i < len(new) else MISSING, f"{path}/{i}")]
    return [{"path": path, "classification": classify(path), "oldPresent": old is not MISSING,
             "newPresent": new is not MISSING, "old": None if old is MISSING else old,
             "new": None if new is MISSING else new}]


def main():
    for key, expected in {
        "GITHUB_REPOSITORY": inventory.REPO, "GITHUB_WORKFLOW_REF": inventory.WORKFLOW,
        "GITHUB_REF": "refs/heads/main", "CONFIRM_PROJECT": release.PROJECT,
        "CONFIRM_SHA": release.SHA, "REQUESTED_ACTION": "pr606-run339-recovery-snapshot",
    }.items():
        inventory.require(os.environ.get(key) == expected, f"Unexpected {key}")
    approved = release.BASELINE
    before = {}
    for name in release.FUNCTIONS:
        record = json.loads((BASE / f"{name}-configuration.json").read_text())
        inventory.require(release.fingerprint(record) == approved["functions"][name]["fingerprint"],
                          f"{name}: wrong Run #333 configuration")
        before[name] = record
    old_host = json.loads((BASE / "hosting.json").read_text())
    release.verify_hosting_baseline(old_host)
    token = inventory.command("Acquire function credentials", ["gcloud", "auth", "print-access-token"]).decode().strip()
    hosting_token = inventory.hosting_access_token(os.environ)
    result = {"failedRun": 42695223717, "baselineRun": approved["run"], "functions": {}, "errors": []}

    def capture(label, operation):
        try:
            return operation()
        except (RuntimeError, KeyError, ValueError, OSError) as exc:
            result["errors"].append({"read": label, "error": str(exc) if isinstance(exc, RuntimeError)
                                     else type(exc).__name__})
            return None

    for name, generation in release.FUNCTIONS.items():
        current = capture(name, lambda: release.function_config(name, token))
        if current is None:
            continue
        record = current["function"]
        safe = inventory.redact(current)
        entry = {"configuration": safe, "changes": changes(before[name], safe)}
        result["functions"][name] = entry

        def fingerprint():
            if generation == 1:
                archive, reference = inventory.source_archive(name, generation, record, token)
            else:
                archive = inventory.signed_source(name, "v2alpha", {}, token)
                reference = record["buildConfig"]["sourceProvenance"]["resolvedStorageSource"]
            evidence = inventory.archive_evidence(archive)
            inventory.require(release.function_config(name, token) == current,
                              f"{name}: configuration changed during source capture")
            return {**evidence, "reference": reference,
                    "matchesRun333": evidence["sha256"] == approved["functions"][name]["sha256"]}

        entry["source"] = capture(name + " source", fingerprint)
        if generation == 2:
            run = current["transport"]["run"]
            service = f"projects/{release.PROJECT}/locations/{release.REGION}/services/{name.lower()}"
            revisions = {f"{service}/revisions/{ORIGINAL}", run["latestReadyRevision"],
                         run["latestCreatedRevision"]}
            for traffic in run.get("trafficStatuses", []):
                if traffic.get("revision"):
                    revisions.add(f"{service}/revisions/{traffic['revision']}")
            entry["revisions"] = {}
            for revision in sorted(revisions):
                inventory.require(re.fullmatch(re.escape(service) + r"/revisions/[a-z0-9-]+", revision),
                                  "Unexpected receipt revision name")
                entry["revisions"][revision] = capture(revision, lambda: inventory.redact(
                    release.get("Read receipt revision", "https://run.googleapis.com/v2/" + revision, token)))

    def read_hosting():
        def get(operation, path):
            return release.get(operation, release.HOSTING_API + path, hosting_token)
        def active():
            return get("Read active Hosting release", release.SITE + "/releases?pageSize=1")["releases"][0]
        live = active()
        prepared = get("Read prepared Hosting version", PREPARED)
        current = live["version"]["name"]
        inventory.require(active()["name"] == live["name"], "Hosting changed during snapshot")
        return {"activeRelease": live["name"], "activeVersion": current,
                "preparedVersion": PREPARED, "preparedStatus": prepared["status"],
                "preparedIsActive": current == PREPARED,
                "matchesRun333": live["name"] == old_host["release"] and current == old_host["version"]}

    result["hosting"] = capture("Hosting", read_hosting)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return int(bool(result["errors"]))


if __name__ == "__main__":
    raise SystemExit(main())
