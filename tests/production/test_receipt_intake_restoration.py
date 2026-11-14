from copy import deepcopy
from contextlib import redirect_stdout
import io
import json
import os
import unittest
from unittest.mock import patch
import zipfile

import receipt_intake_release as release


REVISION = "saveproposalenrollmentagreement-00007-zuk"
SERVICE = "projects/sandmandashboard/locations/us-central1/services/saveproposalenrollmentagreement"
RESULT = {"sourceFilesMatch": True, "liveArchiveSha256": "a" * 64,
          "rollbackArchiveSha256": "b" * 64, "liveRuntimeSha256": "c" * 64,
          "runtimeMatches": False}


def snapshot():
    # Cloud Run v2 REST returns full resource paths for ready/created revisions,
    # a short revision ID for traffic status, and int64 generations as strings.
    return {
        "function": {"buildConfig": {"runtime": "nodejs22"},
                     "serviceConfig": {"environmentVariables": {"SECRET": "private-value"}}},
        "iam": {"version": 1, "etag": "function-etag", "bindings": [
            {"role": "roles/cloudfunctions.invoker", "members": ["user:private@example.invalid"]}]},
        "runIam": {"version": 1, "etag": "run-etag", "bindings": []},
        "run": {
            "name": SERVICE, "generation": "7", "observedGeneration": "7",
            "buildConfig": {}, "annotations": {},
            "latestReadyRevision": f"{SERVICE}/revisions/{REVISION}",
            "latestCreatedRevision": f"{SERVICE}/revisions/{REVISION}",
            "terminalCondition": {"type": "Ready", "state": "CONDITION_SUCCEEDED"},
            "traffic": [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", "percent": 100}],
            "trafficStatuses": [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
                                 "revision": REVISION, "percent": 100,
                                 "uri": "https://private.example.invalid"}],
            "template": {"labels": {}, "containers": [{"image": "candidate"}]},
        },
    }


def archive(body=b"restored", compression=zipfile.ZIP_STORED):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression) as package:
        package.writestr("index.js", body)
    return output.getvalue()


class RestorationEvidenceTest(unittest.TestCase):
    def test_only_hashes_and_verification_flags_are_logged(self):
        before = snapshot()
        out = io.StringIO()
        with redirect_stdout(out), patch.object(release, "config", return_value=before), \
                patch.object(release, "diagnose_release_10", return_value=RESULT) as diagnostic, \
                patch.object(release.release, "write") as write:
            release.capture_restoration_evidence("token", b"candidate")
        receipt = json.loads(out.getvalue())
        self.assertEqual(receipt, {**RESULT, "servingRevisionVerified": True,
                                  "configurationSha256": release.digest(release.inventory.sanitize(before))})
        diagnostic.assert_called_once_with("token", b"candidate", report=False)
        write.assert_not_called()
        for key in ("iam", "runIam"):
            altered = deepcopy(before)
            altered[key]["etag"] = "different"
            self.assertNotEqual(receipt["configurationSha256"],
                                release.digest(release.inventory.sanitize(altered)))

    def test_stale_wrong_or_split_cloud_run_response_is_rejected(self):
        for change in (
            {"observedGeneration": "6"},
            {"latestCreatedRevision": SERVICE + "/revisions/other"},
            {"latestReadyRevision": REVISION},
            {"reconciling": True},
            {"terminalCondition": {"state": "CONDITION_PENDING"}},
            {"trafficStatuses": [{"revision": REVISION, "percent": 99},
                                 {"revision": "old", "percent": 1}]},
        ):
            before = snapshot()
            before["run"].update(change)
            with self.subTest(change=change), patch.object(release, "config", return_value=before), \
                    patch.object(release, "diagnose_release_10") as diagnostic:
                with self.assertRaises(RuntimeError):
                    release.capture_restoration_evidence("token", b"candidate")
                diagnostic.assert_not_called()

    def test_iam_race_fails_without_emitting_a_receipt(self):
        before = snapshot()
        after = deepcopy(before)
        after["runIam"]["etag"] = "changed"
        out = io.StringIO()
        with redirect_stdout(out), patch.object(release, "config", side_effect=[before, after]), \
                patch.object(release, "diagnose_release_10", return_value=RESULT):
            with self.assertRaisesRegex(RuntimeError, "Configuration changed"):
                release.capture_restoration_evidence("token", b"candidate")
        self.assertEqual(out.getvalue(), "")


class SingleFunctionRestorationTest(unittest.TestCase):
    def setUp(self):
        self.before = snapshot()
        self.after = deepcopy(self.before)
        revision = "saveproposalenrollmentagreement-00008-test"
        path = f"{SERVICE}/revisions/{revision}"
        self.after["run"].update({
            "generation": "8", "observedGeneration": "8",
            "latestReadyRevision": path, "latestCreatedRevision": path,
            "trafficStatuses": [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
                                  "revision": revision, "percent": 100}],
        })
        self.rollback = archive()
        self.candidate = archive(b"candidate")
        self.restoration = {
            **release.RESTORATION,
            "configurationSha256": release.digest(release.inventory.sanitize(self.before)),
            "candidateArchiveSha256": "a" * 64,
            "rollbackArchiveSha256": release.inventory.sha(self.rollback),
        }
        self.expected = release.PLAN["functions"][release.RESTORE_NAME]
        self.plan_function = {
            **self.expected,
            "reference": {**self.expected["reference"],
                          "generation": release.RESTORATION["rollbackGeneration"]},
            "recoveryFilesSha256": release.digest(release.archive_hashes(self.rollback)),
        }

    def patches(self):
        return (
            patch.dict(release.RESTORATION, self.restoration, clear=True),
            patch.dict(release.PLAN["functions"], {release.RESTORE_NAME: self.plan_function}),
            patch.object(release, "diagnose_release_10", return_value={
                "sourceFilesMatch": True, "liveArchiveSha256": "a" * 64}),
            patch.object(release, "pinned_recovery", return_value=self.rollback),
            patch.object(release, "unrelated_state", return_value={"functions": {}}),
            patch.object(release, "require_unrelated_unchanged"),
        )

    def test_successful_simulated_single_function_restoration(self):
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], contexts[5], \
                patch.object(release, "config", side_effect=[self.before, self.before, self.after]), \
                patch.object(release.release, "source_update") as update, \
                patch.object(release, "source", return_value=self.rollback), \
                redirect_stdout(io.StringIO()) as output:
            release.restore_single_function("token", self.candidate)
        update.assert_called_once_with(release.RESTORE_NAME, self.rollback, "token")
        receipt = json.loads(output.getvalue())
        self.assertEqual(receipt["function"], release.RESTORE_NAME)
        self.assertTrue(receipt["configurationProtected"])
        self.assertTrue(receipt["excludedResourcesUnchanged"])
        self.assertTrue(receipt["restoredFileHashesMatch"])
        self.assertFalse(receipt["historicalRuntimeFingerprintMatches"])

    def test_equivalent_repacked_zip_uses_file_hashes_as_authority(self):
        repacked = archive(compression=zipfile.ZIP_DEFLATED)
        self.assertNotEqual(release.inventory.sha(repacked), release.inventory.sha(self.rollback))
        self.assertEqual(release.archive_hashes(repacked), release.archive_hashes(self.rollback))
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], contexts[5], \
                patch.object(release, "config", side_effect=[self.before, self.before, self.after]), \
                patch.object(release.release, "source_update"), \
                patch.object(release, "source", return_value=repacked), \
                redirect_stdout(io.StringIO()) as output:
            release.restore_single_function("token", self.candidate)
        receipt = json.loads(output.getvalue())
        self.assertTrue(receipt["restoredFileHashesMatch"])
        self.assertFalse(receipt["restoredArchiveByteForByteMatch"])

    def test_incorrect_configuration_fingerprint_stops_before_write(self):
        with patch.object(release, "config", return_value=self.before), \
                patch.object(release.release, "source_update") as update:
            with self.assertRaisesRegex(RuntimeError, "configuration fingerprint"):
                release.restore_single_function("token", self.candidate)
        update.assert_not_called()

    def test_pre_existing_drift_in_each_excluded_function_stops_before_write(self):
        names = [name for name in release.NAMES if name != release.RESTORE_NAME]
        self.assertEqual(len(names), 7)
        baseline = {name: {"function": {"name": name, "state": "ACTIVE"}} for name in names}
        pins = {name: {"configurationSha256": release.digest(release.inventory.sanitize(value))}
                for name, value in baseline.items()}
        for drifted_name in names:
            live = deepcopy(baseline)
            live[drifted_name]["function"]["state"] = "DRIFTED"
            live[release.RESTORE_NAME] = self.before
            contexts = self.patches()
            with self.subTest(function=drifted_name), contexts[0], contexts[1], contexts[2], contexts[3], \
                    patch.dict(release.PLAN["functions"], pins), \
                    patch.object(release, "config", side_effect=lambda name, _: live[name]), \
                    patch.object(release, "hosting_state", return_value={}), \
                    patch.object(release, "verify_rules", return_value={}), \
                    patch.object(release.release, "source_update") as update:
                with self.assertRaisesRegex(RuntimeError, drifted_name + ": Excluded Function"):
                    release.restore_single_function("token", self.candidate)
                update.assert_not_called()

    def test_read_only_mode_reports_pass_and_redacts_failure(self):
        for error in (None, RuntimeError("private runtime or IAM value")):
            with self.subTest(failing=error is not None), \
                    patch.dict(os.environ, {"RELEASE_MODE": release.VERIFY_RESTORATION_MODE}), \
                    patch.object(release, "guard"), \
                    patch.object(release.subprocess, "check_output", return_value=release.PLAN["candidate"]), \
                    patch.object(release, "authenticated_release_token", return_value="token"), \
                    patch.object(release, "package", return_value=self.candidate), \
                    patch.object(release, "restoration_preflight", side_effect=error,
                                 return_value=(self.before, REVISION, self.rollback, {"functions": {}})) as preflight, \
                    patch.object(release.release, "write") as write, \
                    patch.object(release.release, "source_update") as update, \
                    redirect_stdout(io.StringIO()) as output:
                if error is None:
                    release.main()
                    report = json.loads(output.getvalue())
                    self.assertEqual(report["restorationPreflight"], "PASS")
                    self.assertEqual(report["trafficPercent"], 100)
                    self.assertFalse(report["historicalRuntimeFingerprintMatches"])
                else:
                    with self.assertRaises(SystemExit) as stopped:
                        release.main()
                    self.assertEqual(stopped.exception.code, 1)
                    self.assertEqual(json.loads(output.getvalue())["restorationPreflight"], "FAIL")
                    self.assertNotIn("private", output.getvalue())
                preflight.assert_called_once_with("token", self.candidate)
                write.assert_not_called()
                update.assert_not_called()

    def test_candidate_or_rollback_archive_mismatch_stops_before_write(self):
        for diagnostic, rollback in (
            ({"sourceFilesMatch": False, "liveArchiveSha256": "a" * 64}, self.rollback),
            ({"sourceFilesMatch": True, "liveArchiveSha256": "different"}, self.rollback),
            ({"sourceFilesMatch": True, "liveArchiveSha256": "a" * 64}, archive(b"wrong")),
        ):
            contexts = self.patches()
            with self.subTest(diagnostic=diagnostic), contexts[0], contexts[1], \
                    patch.object(release, "diagnose_release_10", return_value=diagnostic), \
                    patch.object(release, "pinned_recovery", return_value=rollback), \
                    patch.object(release, "config", return_value=self.before), \
                    patch.object(release.release, "source_update") as update:
                with self.assertRaises(RuntimeError):
                    release.restore_single_function("token", self.candidate)
                update.assert_not_called()

    def test_runtime_or_iam_drift_after_write_fails_closed(self):
        drifted = deepcopy(self.after)
        drifted["runIam"]["etag"] = "changed"
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], contexts[5], \
                patch.object(release, "config", side_effect=[self.before, self.before, drifted]), \
                patch.object(release.release, "source_update") as update:
            with self.assertRaisesRegex(RuntimeError, "runtime or IAM changed"):
                release.restore_single_function("token", self.candidate)
        update.assert_called_once()

    def test_split_or_stale_traffic_is_rejected(self):
        cases = [
            {"trafficStatuses": [{"revision": REVISION, "percent": 50},
                                 {"revision": "old", "percent": 50}]},
            {"latestCreatedRevision": f"{SERVICE}/revisions/old"},
            {"reconciling": True},
        ]
        for change in cases:
            value = snapshot()
            value["run"].update(change)
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                release.verify_healthy_serving(value, REVISION)

    def test_original_revision_cannot_be_accepted_as_restored(self):
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], contexts[5], \
                patch.object(release, "config", side_effect=[self.before, self.before, self.before]), \
                patch.object(release.release, "source_update") as update:
            with self.assertRaisesRegex(RuntimeError, "new serving revision"):
                release.restore_single_function("token", self.candidate)
        update.assert_called_once()

    def test_failed_or_uncertain_update_stops_without_retry(self):
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], contexts[5], \
                patch.object(release, "config", side_effect=[self.before, self.before]), \
                patch.object(release.release, "source_update", side_effect=RuntimeError("outcome unknown")) as update, \
                redirect_stdout(io.StringIO()) as output:
            with self.assertRaisesRegex(RuntimeError, "outcome unknown"):
                release.restore_single_function("token", self.candidate)
        update.assert_called_once()
        self.assertTrue(json.loads(output.getvalue())["STOP_NO_RETRY"])

    def test_unrelated_resource_change_fails_without_automatic_reverse(self):
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], \
                patch.object(release, "require_unrelated_unchanged",
                             side_effect=[None, RuntimeError("Excluded Functions changed")]), \
                patch.object(release, "config", side_effect=[self.before, self.before, self.after]), \
                patch.object(release.release, "source_update") as update, \
                patch.object(release, "source", return_value=self.rollback):
            with self.assertRaisesRegex(RuntimeError, "Excluded Functions"):
                release.restore_single_function("token", self.candidate)
        update.assert_called_once()

    def test_actual_excluded_function_hosting_and_rules_comparison(self):
        names = [name for name in release.NAMES if name != release.RESTORE_NAME]
        function_state = {name: {"name": name, "etag": "stable"} for name in names}
        hosting = {"active": ("release", "version"), "manifest": {"/": "hash"}}
        rules = {"release": {"rulesetName": "ruleset"}, "rollback": {"name": "ruleset"}}

        def configs(name, _token):
            return deepcopy(function_state[name])

        with patch.object(release, "config", side_effect=configs), \
                patch.object(release, "hosting_state", return_value=deepcopy(hosting)), \
                patch.object(release, "verify_rules", return_value=deepcopy(rules)):
            expected = release.unrelated_state("token")
            self.assertEqual(set(expected["functions"]), set(names))
            self.assertNotIn(release.RESTORE_NAME, expected["functions"])
            release.require_unrelated_unchanged("token", expected)

        altered_functions = deepcopy(function_state)
        altered_functions[names[0]]["etag"] = "changed"
        with patch.object(release, "config", side_effect=lambda name, _: deepcopy(altered_functions[name])), \
                patch.object(release, "hosting_state", return_value=deepcopy(hosting)), \
                patch.object(release, "verify_rules", return_value=deepcopy(rules)):
            with self.assertRaisesRegex(RuntimeError, "Excluded Functions"):
                release.require_unrelated_unchanged("token", expected)

        with patch.object(release, "config", side_effect=configs), \
                patch.object(release, "hosting_state", return_value={**hosting, "active": ("new", "version")}), \
                patch.object(release, "verify_rules", return_value=deepcopy(rules)):
            with self.assertRaisesRegex(RuntimeError, "Hosting"):
                release.require_unrelated_unchanged("token", expected)

        with patch.object(release, "config", side_effect=configs), \
                patch.object(release, "hosting_state", return_value=deepcopy(hosting)), \
                patch.object(release, "verify_rules",
                             return_value={**rules, "release": {"rulesetName": "new-ruleset"}}):
            with self.assertRaisesRegex(RuntimeError, "Firestore Rules"):
                release.require_unrelated_unchanged("token", expected)

    def test_separate_owner_authorization_and_existing_guards(self):
        repo = "raulsandoval81-maker/SandmanSystem"
        base = {
            "GITHUB_REPOSITORY": repo, "GITHUB_REF": "refs/heads/main",
            "GITHUB_WORKFLOW_REF": f"{repo}/.github/workflows/production-receipt-intake-release.yml@refs/heads/main",
            "CONFIRM_PROJECT": release.PROJECT, "CONFIRM_SHA": release.PLAN["candidate"],
        }
        with patch.dict(os.environ, base, clear=True):
            with self.assertRaisesRegex(RuntimeError, "restoration confirmation"):
                release.guard("restore-save-proposal-agreement")
        with patch.dict(os.environ, {**base, "CONFIRM_RELEASE": release.RESTORE_CONFIRMATION}, clear=True):
            release.guard("restore-save-proposal-agreement")
            with self.assertRaisesRegex(RuntimeError, "verification confirmation"):
                release.guard(release.VERIFY_RESTORATION_MODE)
        with patch.dict(os.environ, {**base, "CONFIRM_RELEASE": release.VERIFY_RESTORATION_CONFIRMATION}, clear=True):
            release.guard(release.VERIFY_RESTORATION_MODE)
            with self.assertRaisesRegex(RuntimeError, "restoration confirmation"):
                release.guard("restore-save-proposal-agreement")
        for mode, confirmation in (("deploy", "DEPLOY-RECEIPT-INTAKE-42924733167"),
                                   ("rollback", "ROLLBACK-RECEIPT-INTAKE-42924733167")):
            with patch.dict(os.environ, {**base, "CONFIRM_RELEASE": confirmation}, clear=True):
                if mode == "deploy":
                    with patch.dict(release.PLAN, pendingCoreFunctionBaseline=False):
                        release.guard(mode)
                else:
                    release.guard(mode)
        self.assertNotEqual(release.RESTORATION["capturedRuntimeSha256"],
                            release.PLAN["functions"][release.RESTORE_NAME]["runtimeSha256"])
        self.assertEqual(release.PLAN["functions"][release.RESTORE_NAME]["configurationSha256"],
                         "84087a4e1fb4edca2bff6a4e6d4c0d3753cc39cfd45aac1b68039b3c8d80ab50")
