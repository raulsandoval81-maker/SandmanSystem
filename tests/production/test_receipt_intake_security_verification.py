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
            env = {"SECURITY_EVIDENCE_ROOT": directory, "SECURITY_EVIDENCE_PATH": str(path)}
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
                                             return_value={"supported": False,
                                                           "reason": "cloud-asset-access-unavailable"}))
            stack.enter_context(patch.object(release, "source", return_value=b"source"))
            stack.enter_context(patch.object(release, "pinned_recovery", return_value=b"rollback"))
            stack.enter_context(patch.object(release, "archive_hashes", return_value=files))
            stack.enter_context(patch.object(release, "hosting_state", return_value=deepcopy(hosting)))
            stack.enter_context(patch.object(release, "verify_rules", return_value=deepcopy(rules)))
            prepare = stack.enter_context(patch.object(release, "prepare_hosting"))
            update = stack.enter_context(patch.object(release.release, "source_update"))
            publish = stack.enter_context(patch.object(release, "publish"))
            stack.enter_context(redirect_stdout(io.StringIO()))
            release.verify_issue_handoff_security("token", {TARGET: b"candidate"}, env)

            evidence = json.loads(path.read_text())
            serialized = path.read_text()
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
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

    def test_missing_required_read_permission_fails_closed(self):
        response = json.dumps({"permissions": ["cloudfunctions.functions.get"]}).encode()
        with patch.object(release.inventory, "request", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "read permissions unavailable"):
                release.verify_security_read_permissions("token")

    def test_target_configuration_drift_is_rejected(self):
        target = function_snapshot(TARGET)
        changed = deepcopy(target)
        changed["runIam"]["etag"] = "changed"
        calls = 0

        def config(name, _token):
            nonlocal calls
            if name == TARGET:
                calls += 1
                return deepcopy(target if calls == 1 else changed)
            return function_snapshot(name)

        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            stack.enter_context(patch.object(release, "verify_security_read_permissions"))
            stack.enter_context(patch.object(release, "config", side_effect=config))
            stack.enter_context(patch.object(release, "verify_function_healthy", return_value="revision"))
            stack.enter_context(patch.object(release, "invocation_summary", return_value={}))
            stack.enter_context(patch.object(release, "protected_reference_summary",
                                             return_value=({}, "runtime@example.invalid")))
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
                                                 "issue-handoff-security-verification.json")}
            with self.assertRaisesRegex(RuntimeError, "Target configuration changed"):
                release.verify_issue_handoff_security("token", {TARGET: b"candidate"}, env)

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
                patch.object(release, "verify_issue_handoff_security") as verify, \
                patch.object(release, "forward_resume") as deploy, \
                patch.object(release, "rollback") as rollback:
            release.main()
        verify.assert_called_once_with("token", {TARGET: b"candidate"})
        deploy.assert_not_called()
        rollback.assert_not_called()


if __name__ == "__main__":
    unittest.main()
