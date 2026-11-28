#!/usr/bin/env python3
"""Public staging byte checks and unauthenticated-call denial after publication.

This is NOT a substitute for authenticated, role-scoped staging acceptance.
"""
import hashlib
import json
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
PROJECT = "sandman-combat-staging"
m = json.loads((Path(__file__).parent / "release-manifest.json").read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def validate_public_assets():
    for remote in m["hostingPaths"]:
        target = ROOT / ("public" + remote)
        expected = m["sourceFilesSha256"]["public" + remote]
        assert sha(target.read_bytes()) == expected, "Source asset changed: " + remote
        url = "https://" + PROJECT + ".web.app" + remote + "?sprint1=" + m["sourceSha"]
        req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=35) as response:
            assert response.geturl().startswith("https://" + PROJECT + ".web.app/"), "Unexpected redirect"
            assert sha(response.read()) == expected, "Published bytes differ: " + remote


def validate_transport_denial():
    for name in ("getAthleteProfileFeed", "getAthleteSkillsSummary"):
        url = "https://us-central1-" + PROJECT + ".cloudfunctions.net/" + name
        req = urllib.request.Request(
            url, method="POST", data=json.dumps({"data": {"athleteId": "SYNTHETIC_NONEXISTENT"}}).encode(),
            headers={"Content-Type": "application/json", "Origin": "https://" + PROJECT + ".web.app"})
        try:
            with urllib.request.urlopen(req, timeout=30):
                raise RuntimeError("Unauthenticated callable returned success: " + name)
        except urllib.error.HTTPError as error:
            data = error.read(16384).decode(errors="replace")
            assert error.code == 401 and "UNAUTHENTICATED" in data.upper(), (
                "Callable transport blocked before app auth or returned unexpected result: " + name)


if __name__ == "__main__":
    try:
        assert m["project"] == PROJECT and m["productionAuthorized"] is False
        validate_public_assets()
        validate_transport_denial()
        print("PASS_PUBLIC_ASSET_BYTES_AND_UNAUTHENTICATED_CALLABLE_DENIAL")
        print("AUTHENTICATED_STAGING_ACCEPTANCE_REMAINS_REQUIRED")
    except Exception:
        print("STOP_NO_RETRY_POSTPUBLICATION_VERIFICATION_FAILED", file=sys.stderr)
        sys.exit(1)
