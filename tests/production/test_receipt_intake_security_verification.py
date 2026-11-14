import io
import json
import os
import tempfile
import unittest
import urllib.error
from contextlib import ExitStack, redirect_stdout
from copy import deepcopy
from pathlib import Path
from unittest.mock import Mock, patch

import receipt_intake_release as release
from test_receipt_intake_runtime import snapshot as runtime_snapshot


TARGET = "issueProposalEnrollmentHandoff"


def function_snapshot(name):
    value = runtime_snapshot()
    service = f"projects/{release.PROJECT}/locations/{release.REGION}/services/{name.lower()}"
    revision = name.lower() + "-00008-test"
    value["function"]["serviceConfig"].update({
        "service": service,
        "serviceAccountEmail": "sensitive-runtime@example.invalid",
    })
    value["run"].update({
        "name": service,
        "latestReadyRevision": f"{service}/revisions/{revision}",
        "latestCreatedRevision": f"{service}/revisions/{revision}",
        "generation": "8", "observedGeneration": "8",
    })
    value["run"]["template"]["serviceAccount"] = "sensitive-runtime@example.invalid"
    value["run"]["trafficStatuses"][0]["revision"] = revision
    value["iam"]["bindings"][0]["members"] = ["user:sensitive-principal@example.invalid"]
    return value


class SecurityVerificationTest(unittest.TestCase):
    def test_success_writes_only_redacted_protected_evidence(self):
        target = function_snapshot(TARGET)
        snapshots = {name: function_snapshot(name) for name in release.NAMES}
        snapshots[TARGET] = target
        excluded = {name: function_snapshot(name) for name in release.EXCLUDED_NAMES}
        snapshots.update(excluded)
        files = {"index.js": "a" * 64}
        files_sha = release.digest(files)
        hosting = {"active": ("release", "version"), "configuration": {"headers": []},
                   "manifest": {"/index.html": "b" * 64}}
        rules = {"release": {"rulesetName": "ruleset"}, "rollback": {"name": "ruleset"}}

        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            path = Path(directory) / "issue-handoff-security-verification.json"
            env = {"SECURITY_EVIDENCE_ROOT": directory, "SECURITY_EVIDENCE_PATH": str(path),
                   "SECURITY_EVIDENCE_GCS_URI": "gs://approved-private-bucket/security",
                   "SECURITY_EVIDENCE_RETENTION_DAYS": "30",
                   "SECURITY_EVIDENCE_RETENTION_APPROVAL": release.SECURITY_RETENTION_APPROVAL}
            stack.enter_context(patch.dict(
                release.RESTORATION,
                {"configurationSha256": release.digest(release.inventory.sanitize(
                    snapshots[release.RESTORE_NAME]))}))
            for name in snapshots:
                stack.enter_context(patch.dict(
                    release.PLAN["functions"][name], {"recoveryFilesSha256": files_sha}))
            stack.enter_context(patch.object(release, "verify_security_read_permissions"))
            stack.enter_context(patch.object(release, "config",
                                             side_effect=lambda name, _token: deepcopy(snapshots[name])))
            stack.enter_context(patch.object(release, "verify_function_healthy",
                                             return_value="serving-revision"))
            stack.enter_context(patch.object(release, "verify_original_function_baseline"))
            stack.enter_context(patch.object(release, "verified_excluded_baselines",
                                             return_value=deepcopy(excluded)))
            stack.enter_context(patch.object(release, "runtime_access_summary",
                                             return_value={"supported": True, "policyCount": 1,
                                                           "policySetSha256": "c" * 64}))
            stack.enter_context(patch.object(release, "source", return_value=b"source"))
            stack.enter_context(patch.object(release, "pinned_recovery", return_value=b"rollback"))
            stack.enter_context(patch.object(release, "archive_hashes", return_value=files))
            stack.enter_context(patch.object(release, "hosting_state", return_value=deepcopy(hosting)))
            stack.enter_context(patch.object(release, "verify_rules", return_value=deepcopy(rules)))
            retained = stack.enter_context(patch.object(
                release, "retain_protected_security_evidence",
                return_value={"evidenceSha256": "d" * 64,
                              "objectGenerationSha256": "e" * 64,
                              "capturedAt": "2026-11-14T00:00:00+00:00"}))
            prepare = stack.enter_context(patch.object(release, "prepare_hosting"))
            update = stack.enter_context(patch.object(release.release, "source_update"))
            publish = stack.enter_context(patch.object(release, "publish"))
            output = io.StringIO()
            stack.enter_context(redirect_stdout(output))
            status = release.verify_issue_handoff_security("token", {TARGET: b"candidate"}, env)

            evidence = retained.call_args.args[0]
            serialized = json.dumps(evidence, sort_keys=True)
            self.assertEqual(status, "COLLECTED_NOT_CLEARED")
            self.assertIn('"issueHandoffSecurityVerification": "COLLECTED_NOT_CLEARED"',
                          output.getvalue())
            self.assertNotIn('"PASS"', output.getvalue())
            self.assertEqual(evidence["mode"], "READ_ONLY")
            self.assertEqual(evidence["productionWrites"], 0)
            self.assertFalse(evidence["deploymentAuthorized"])
            self.assertIn("current", evidence)
            self.assertIn("historical", evidence)
            self.assertNotEqual(evidence["current"]["configurationSha256"],
                                evidence["historical"]["configurationSha256"])
            for sensitive in ("sensitive-runtime@example.invalid",
                              "sensitive-principal@example.invalid", "secretKeyRef"):
                self.assertNotIn(sensitive, serialized)
            prepare.assert_not_called()
            update.assert_not_called()
            publish.assert_not_called()

    def test_source_mismatch_fails_and_unknown_effective_access_is_unverified(self):
        self.assertEqual(release.security_collection_status(False, True), "FAIL")
        self.assertEqual(release.security_collection_status(True, False), "UNVERIFIED")
        self.assertEqual(release.security_collection_status(True, True),
                         "COLLECTED_NOT_CLEARED")
        self.assertNotIn("PASS", {release.security_collection_status(False, True),
                                   release.security_collection_status(True, False),
                                   release.security_collection_status(True, True)})

    def test_iam_conditions_and_anonymous_access_are_evidence_not_approval(self):
        value = function_snapshot(TARGET)
        value["iam"]["bindings"].append({
            "role": "roles/cloudfunctions.invoker", "members": ["allUsers"],
            "condition": {"title": "unexpected", "expression": "true"},
        })
        summary = release.invocation_summary(value)
        self.assertTrue(summary["cloudFunctions"]["anonymous"])
        self.assertEqual(summary["cloudFunctions"]["conditionalBindingCount"], 1)
        self.assertEqual(release.security_collection_status(True, True),
                         "COLLECTED_NOT_CLEARED")

    def test_missing_required_read_permission_fails_closed(self):
        response = json.dumps({"permissions": ["cloudfunctions.functions.get"]}).encode()
        with patch.object(release.inventory, "request", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "read permissions unavailable"):
                release.verify_security_read_permissions("token")

    def test_target_configuration_drift_is_rejected(self):
        target = function_snapshot(TARGET)
        cases = {
            "iam-condition": lambda value: value["runIam"]["bindings"].append({
                "role": "roles/run.invoker", "members": ["allUsers"],
                "condition": {"title": "unexpected", "expression": "true"}}),
            "secret-reference": lambda value: value["run"]["template"]["containers"][0]["env"][1]
            ["valueSource"]["secretKeyRef"].update({"version": "changed"}),
            "service-account": lambda value: value["run"]["template"].update(
                {"serviceAccount": "changed@example.invalid"}),
            "ingress": lambda value: value["run"].update(
                {"ingress": "INGRESS_TRAFFIC_INTERNAL_ONLY"}),
        }
        for label, mutate in cases.items():
            changed = deepcopy(target)
            mutate(changed)
            calls = 0

            def config(name, _token):
                nonlocal calls
                if name == TARGET:
                    calls += 1
                    return deepcopy(target if calls == 1 else changed)
                return function_snapshot(name)

            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
                stack.enter_context(patch.object(release, "verify_security_read_permissions"))
                stack.enter_context(patch.object(release, "config", side_effect=config))
                stack.enter_context(patch.object(release, "verify_function_healthy", return_value="revision"))
                stack.enter_context(patch.object(release, "runtime_access_summary",
                                                 return_value={"supported": False}))
                stack.enter_context(patch.object(release, "source", return_value=b"source"))
                stack.enter_context(patch.object(release, "archive_hashes", return_value={}))
                stack.enter_context(patch.dict(
                    release.RESTORATION,
                    {"configurationSha256": release.digest(release.inventory.sanitize(
                        function_snapshot(release.RESTORE_NAME)))}))
                stack.enter_context(patch.object(release, "verify_original_function_baseline"))
                stack.enter_context(patch.object(release, "verified_excluded_baselines", return_value={}))
                stack.enter_context(patch.object(release, "hosting_state", return_value={}))
                stack.enter_context(patch.object(release, "verify_rules", return_value={}))
                stack.enter_context(patch.object(release, "pinned_recovery", return_value=b"rollback"))
                for name in release.NAMES:
                    stack.enter_context(patch.dict(
                        release.PLAN["functions"][name],
                        {"recoveryFilesSha256": release.digest({})}))
                env = {"SECURITY_EVIDENCE_ROOT": directory,
                       "SECURITY_EVIDENCE_PATH": str(Path(directory) /
                                                     "issue-handoff-security-verification.json"),
                       "SECURITY_EVIDENCE_GCS_URI": "gs://approved-private-bucket/security",
                       "SECURITY_EVIDENCE_RETENTION_DAYS": "30",
                       "SECURITY_EVIDENCE_RETENTION_APPROVAL": release.SECURITY_RETENTION_APPROVAL}
                with self.assertRaisesRegex(release.SecurityViolation,
                                            "Target configuration changed"):
                    release.verify_issue_handoff_security("token", {TARGET: b"candidate"}, env)

    def test_unexpected_traffic_is_rejected(self):
        value = function_snapshot(TARGET)
        value["run"]["trafficStatuses"] = [
            {"revision": "one", "percent": 50}, {"revision": "two", "percent": 50}]
        with self.assertRaisesRegex(RuntimeError, "traffic"):
            release.verify_function_healthy(TARGET, value)

    def test_missing_retention_is_unverified_before_cloud_reads(self):
        with patch.object(release, "verify_security_read_permissions") as permissions, \
                redirect_stdout(io.StringIO()) as output:
            status = release.verify_issue_handoff_security("token", {TARGET: b"candidate"}, {})
        self.assertEqual(status, "UNVERIFIED")
        self.assertIn('"independentReviewPossible": false', output.getvalue())
        permissions.assert_not_called()

    def test_private_retention_requires_access_controls_and_integrity_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "issue-handoff-security-verification.json"
            env = {"SECURITY_EVIDENCE_ROOT": directory, "SECURITY_EVIDENCE_PATH": str(path),
                   "SECURITY_EVIDENCE_GCS_URI": "gs://approved-private-bucket/security",
                   "SECURITY_EVIDENCE_RETENTION_DAYS": "30",
                   "SECURITY_EVIDENCE_RETENTION_APPROVAL": release.SECURITY_RETENTION_APPROVAL,
                   "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1"}
            policy = {"bindings": [{"role": "roles/storage.objectViewer",
                                     "members": ["group:security@example.invalid"]}]}
            bucket = {"iamConfiguration": {"uniformBucketLevelAccess": {"enabled": True}},
                      "retentionPolicy": {"retentionPeriod": str(30 * 86400)}}
            metadata = {"metadata": {}, "size": "0", "generation": "99"}

            def check_output(command, text):
                if "get-iam-policy" in command:
                    return json.dumps(policy)
                if "buckets" in command and "describe" in command:
                    return json.dumps(bucket)
                payload = path.read_bytes()
                sha = release.inventory.sha(payload)
                return json.dumps({**metadata, "metadata": {"sha256": sha},
                                   "size": str(len(payload))})

            with patch.object(release.subprocess, "check_output", side_effect=check_output), \
                    patch.object(release.subprocess, "run") as upload:
                receipt = release.retain_protected_security_evidence(
                    {"mode": "READ_ONLY", "productionWrites": 0}, env)
            self.assertRegex(receipt["evidenceSha256"], r"^[a-f0-9]{64}$")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            upload.assert_called_once()
            self.assertIn("--if-generation-match=0", upload.call_args.args[0])

            public_policy = {"bindings": [{"members": ["allUsers"]}]}
            second = Path(directory) / "second"
            second.mkdir()
            bad_env = {**env, "SECURITY_EVIDENCE_ROOT": str(second),
                       "SECURITY_EVIDENCE_PATH": str(
                           second / "issue-handoff-security-verification.json")}
            with patch.object(release.subprocess, "check_output",
                              return_value=json.dumps(public_policy)), \
                    self.assertRaisesRegex(RuntimeError, "public access"):
                release.retain_protected_security_evidence({}, bad_env)

    def test_cloud_asset_permission_limit_is_redacted_and_nonfatal(self):
        error = urllib.error.HTTPError("https://redacted.invalid", 403, "denied", {}, None)
        opener = Mock()
        opener.open.side_effect = error
        with patch.object(release.urllib.request, "build_opener", return_value=opener):
            result = release.runtime_access_summary("sensitive@example.invalid", "token")
        self.assertEqual(result, {"supported": False,
                                  "reason": "cloud-asset-access-unavailable"})

    def test_separate_guard_and_workflow_have_no_artifact_export(self):
        repo = "raulsandoval81-maker/SandmanSystem"
        base = {"GITHUB_REPOSITORY": repo, "GITHUB_REF": "refs/heads/main",
                "GITHUB_WORKFLOW_REF": f"{repo}/.github/workflows/production-receipt-intake-release.yml@refs/heads/main",
                "CONFIRM_PROJECT": release.PROJECT, "CONFIRM_SHA": release.PLAN["candidate"]}
        with patch.dict(os.environ, base, clear=True):
            with self.assertRaisesRegex(RuntimeError, "security verification confirmation"):
                release.guard(release.SECURITY_VERIFY_MODE)
        with patch.dict(os.environ, {**base, "CONFIRM_RELEASE": release.SECURITY_VERIFY_CONFIRMATION}, clear=True):
            release.guard(release.SECURITY_VERIFY_MODE)
            with self.assertRaises(RuntimeError):
                release.guard(release.FORWARD_RESUME_MODE)
        workflow = (Path(__file__).resolve().parents[2] /
                    ".github/workflows/production-receipt-intake-release.yml").read_text()
        self.assertIn("verify-issue-handoff-security", workflow)
        self.assertIn("runner.temp", workflow)
        self.assertNotIn("upload-artifact", workflow)

    def test_main_routes_security_mode_without_deploy_or_rollback(self):
        with patch.dict(os.environ, {"RELEASE_MODE": release.SECURITY_VERIFY_MODE}, clear=True), \
                patch.object(release, "guard"), \
                patch.object(release.subprocess, "check_output",
                             return_value=release.PLAN["candidate"] + "\n"), \
                patch.object(release, "package", return_value=b"candidate"), \
                patch.object(release, "authenticated_release_token", return_value="token"), \
                patch.object(release, "verify_issue_handoff_security",
                             return_value="COLLECTED_NOT_CLEARED") as verify, \
                patch.object(release, "forward_resume") as deploy, \
                patch.object(release, "rollback") as rollback:
            release.main()
        verify.assert_called_once_with("token", {TARGET: b"candidate"})
        deploy.assert_not_called()
        rollback.assert_not_called()

        for result in ("FAIL", "UNVERIFIED"):
            with self.subTest(result=result), \
                    patch.dict(os.environ, {"RELEASE_MODE": release.SECURITY_VERIFY_MODE}, clear=True), \
                    patch.object(release, "guard"), \
                    patch.object(release.subprocess, "check_output",
                                 return_value=release.PLAN["candidate"] + "\n"), \
                    patch.object(release, "package", return_value=b"candidate"), \
                    patch.object(release, "authenticated_release_token", return_value="token"), \
                    patch.object(release, "verify_issue_handoff_security", return_value=result), \
                    patch.object(release, "forward_resume") as deploy, \
                    patch.object(release, "rollback") as rollback, \
                    self.assertRaises(SystemExit):
                release.main()
            deploy.assert_not_called()
            rollback.assert_not_called()


if __name__ == "__main__":
    unittest.main()
