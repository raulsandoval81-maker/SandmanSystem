#!/usr/bin/env python3
"""Offline exact-six source packaging after a fresh staging capture.

This command cannot deploy, modify IAM, publish Hosting, or approve a release.
The original PR482 seven-Function release and immutable pin remain unchanged.
"""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("pr482_original_release", ROOT/"pr482-release.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
require = r.require


def verify_candidate_capture(original, run15_after, audit, fresh, fresh_receipt, plan):
    m = r.manifest()
    require(plan["status"] == "RECOVERY_PLAN_ONLY_NOT_AUTHORIZED"
            and plan["deploymentAuthorized"] is False
            and plan["productionAuthorized"] is False,
            "Recovery plan is not non-authorizing")
    require(plan["functionsToPrepare"] == r.c.FUNCTIONS[1:]
            and plan["preservedFunction"] == r.c.FUNCTIONS[0]
            and plan["applicationSha"] == r.c.SHA,
            "Exact six-Function scope or source drift")
    require(plan["originalBaselineSha256"] == m["baselineSha256"]
            and r.c.baseline_digest(original) == m["baselineSha256"],
            "Original certified baseline changed")
    require(audit.get("status") == "VERIFIED_PARTIAL_STAGING_DEPLOYMENT"
            and audit.get("deploymentAuthorized") is False
            and audit.get("allIamMatchesRecordedEvidence") is True
            and audit.get("otherSixFunctionsMatchOriginal") is True
            and audit.get("hostingMatchesOriginal") is True
            and audit.get("cloudRunReady") is True,
            "Prior partial-deployment verification not certified")
    require(fresh["project"] == r.c.PROJECT
            and fresh["applicationSha"] == r.c.SHA
            and set(fresh["functions"]) == set(r.c.FUNCTIONS),
            "Fresh capture scope changed")
    require(fresh["authorization"] == original["authorization"],
            "Fresh authorization differs from certified baseline")
    require(r.c.canonical_hosting(fresh["hosting"]) == r.c.canonical_hosting(original["hosting"]),
            "Hosting changed since certified baseline")
    require(fresh["functions"][r.c.FUNCTIONS[0]] == run15_after,
            "Already-deployed first Function changed")
    for name in r.c.FUNCTIONS[1:]:
        require(fresh["functions"][name] == original["functions"][name],
                "Untouched Function drift: " + name)
    require(fresh_receipt["baselineSha256"] == r.c.baseline_digest(fresh),
            "Fresh capture baseline receipt changed")
    require(set(fresh_receipt["rollback"]) == set(r.c.FUNCTIONS),
            "Fresh rollback evidence incomplete")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True, type=Path)
    p.add_argument("--original", required=True, type=Path)
    p.add_argument("--run15-after", required=True, type=Path)
    p.add_argument("--audit", required=True, type=Path)
    p.add_argument("--plan", required=True, type=Path)
    p.add_argument("--fresh-baseline", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    a = p.parse_args()
    original = json.loads(a.original.read_text())
    after = json.loads(a.run15_after.read_text())
    audit = json.loads(a.audit.read_text())
    plan = json.loads(a.plan.read_text())
    fresh = json.loads((a.fresh_baseline/"baseline.json").read_text())
    receipt = json.loads((a.fresh_baseline/"receipt.json").read_text())
    verify_candidate_capture(original, after, audit, fresh, receipt, plan)
    r.package(a.source, a.fresh_baseline, a.out, candidate=True,
              selected_functions=r.c.FUNCTIONS[1:])
    prepared = json.loads((a.out/"prepared.json").read_text())
    require(prepared == {
        "sourceSha": r.c.SHA,
        "baselineSha256": receipt["baselineSha256"],
        "functions": r.c.FUNCTIONS[1:],
        "candidateOnly": True,
    }, "Candidate-only package receipt mismatch")
    return prepared


if __name__ == "__main__":
    main()
