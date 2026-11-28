#!/usr/bin/env python3
"""Build an isolated two-callable source tree from the pinned, tested Sprint 1 commit.

No Firebase or Google Cloud calls. Never package unrelated modules, .env or secrets.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

SOURCE_SHA = "0e9d96e3994094fffacbb606ac77f474902bf666"
ALLOWED = (
    "lib/modules/athlete/getAthleteProfileFeed.js",
    "lib/modules/athlete/getAthleteSkillsSummary.js",
    "lib/services/athleteProfileReadAuthorization.js",
    "lib/services/staffAuthorization.js",
)
MAIN = """const admin=require('firebase-admin/app');
if (!admin.getApps().length) admin.initializeApp();
exports.getAthleteProfileFeed=require('./lib/modules/athlete/getAthleteProfileFeed').getAthleteProfileFeed;
exports.getAthleteSkillsSummary=require('./lib/modules/athlete/getAthleteSkillsSummary').getAthleteSkillsSummary;
"""


def require(value, reason):
    if not value:
        raise RuntimeError(reason)


def build(source, destination):
    source = source.resolve()
    destination = destination.resolve()
    require(subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"],
                                    text=True).strip() == SOURCE_SHA,
            "Function source must be the exact tested Sprint 1 SHA")
    require(not destination.exists(), "Destination must not already exist")
    package = source / "functions"
    require((package / "package-lock.json").exists(), "Missing exact package lock")
    require((package / "node_modules/firebase-admin").exists() and
            (package / "node_modules/firebase-functions").exists(),
            "Dependencies must be installed in immutable source checkout")
    # The compiled modules must have been generated from the pinned TypeScript source.
    # The caller runs npm ci and npm run build immediately before this step.
    for item in ALLOWED:
        require((package / item).is_file(), "Missing compiled dependency: " + item)
    destination.mkdir(parents=True)
    for item in ALLOWED:
        target = destination / item
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(package / item, target)
    for item in ("package.json", "package-lock.json"):
        shutil.copyfile(package / item, destination / item)
    metadata = json.loads((destination / "package.json").read_text())
    metadata["main"] = "index.cjs"
    metadata.pop("scripts", None)
    (destination / "package.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (destination / "index.cjs").write_text(MAIN)
    # Unexpected files, dot-env files, and miscellaneous compiled backend modules are forbidden.
    expected = {*ALLOWED, "package.json", "package-lock.json", "index.cjs"}
    found = {p.relative_to(destination).as_posix() for p in destination.rglob("*") if p.is_file()}
    require(found == expected, "Release package contains unreviewed code or files")
    for item in ALLOWED:
        text = (destination / item).read_text()
        require("require(" in text, "Compiled module looks invalid: " + item)
    environment = {**__import__("os").environ, "NODE_PATH": str(package / "node_modules")}
    environment.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
    environment.pop("CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", None)
    subprocess.run(["node", "-e", """const assert=require('node:assert/strict');
      const x=require(process.argv[1]);
      assert.deepEqual(Object.keys(x).sort(),['getAthleteProfileFeed','getAthleteSkillsSummary']);
      for(const v of Object.values(x)) assert.ok(v.__endpoint?.callableTrigger);
    """, str(destination / "index.cjs")], check=True, env=environment)
    digest = {
        p: hashlib.sha256((destination / p).read_bytes()).hexdigest()
        for p in sorted(expected)
    }
    return {"status": "TWO_CALLABLES_ONLY", "sourceSha": SOURCE_SHA,
            "callables": ["getAthleteProfileFeed", "getAthleteSkillsSummary"],
            "packages": digest, "releaseAuthorized": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.out), indent=2))
