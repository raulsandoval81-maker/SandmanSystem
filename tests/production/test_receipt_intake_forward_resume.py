import io
import json
import os
import unittest
import zipfile
from copy import deepcopy
from contextlib import redirect_stdout
from unittest.mock import patch

import receipt_intake_release as release
from test_receipt_intake_runtime import snapshot as runtime_snapshot


def archive(body):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as package:
        package.writestr("index.js", body)
    return output.getvalue()


def serving(name, revision):
    value = runtime_snapshot()
    value["function"].update({"status": "ACTIVE",
                              "versionId": "6" if revision.endswith("-new") else "5"})
    service = f"projects/{release.PROJECT}/locations/{release.REGION}/services/{name.lower()}"
    value["run"].update({
        "name": service,
        "latestReadyRevision": f"{service}/revisions/{revision}",
        "latestCreatedRevision": f"{service}/revisions/{revision}",
        "generation": "2", "observedGeneration": "2",
    })
    value["run"]["trafficStatuses"][0]["revision"] = revision
    return value


class ForwardResumeTest(unittest.TestCase):
    def setUp(self):
        self.names = release.NAMES
        self.packages = {name: archive(f"candidate-{name}".encode()) for name in self.names}
        self.before = {name: serving(name, f"{name.lower()}-old") for name in self.names}
        self.excluded = {name: serving(name, f"{name.lower()}-old")
                         for name in release.EXCLUDED_NAMES}
        self.after = {name: serving(name, f"{name.lower()}-new") for name in self.names[1:]}
        self.hosting = {"active": ("release", "version"), "configuration": {},
                        "manifest": {path: item["baselineHash"]
                                     for path, item in release.PLAN["hosting"]["assets"].items()}}
        self.rules = {"release": "rules", "rollback": "ruleset"}
        self.expected = {"functions": deepcopy(self.before),
                         "excluded": deepcopy(self.excluded),
                         "hosting": deepcopy(self.hosting), "rules": deepcopy(self.rules)}

    def run_forward(self, *, update_error=None, publish_error=None, source_mismatch=None,
                    excluded_drift_after=None, excluded_drift_on_publish=False):
        state = deepcopy(self.expected)
        events = []

        def update(name, _package, _token):
            events.append(name)
            if update_error == name:
                raise RuntimeError("uncertain update")
            state["functions"][name] = deepcopy(self.after[name])
            if excluded_drift_after == name:
                state["excluded"][release.EXCLUDED_NAMES[0]]["iam"]["bindings"] = [{"role": "drift"}]

        def publish(_version, _token):
            events.append("Hosting")
            if excluded_drift_on_publish:
                state["excluded"][release.EXCLUDED_NAMES[0]]["iam"]["bindings"] = [{"role": "drift"}]
            if publish_error:
                raise publish_error

        def current(_token):
            return deepcopy(state)

        with patch.object(release, "forward_resume_preflight",
                          return_value=(deepcopy(self.expected), {n: b"rollback" for n in self.names[1:]},
                                        f"{self.names[0].lower()}-old")), \
                patch.object(release, "forward_state", side_effect=current), \
                patch.object(release, "config", side_effect=lambda n, _t: deepcopy(
                    state["functions"][n] if n in state["functions"] else state["excluded"][n])), \
                patch.object(release, "prepare_hosting", return_value="new-version"), \
                patch.object(release.release, "source_update", side_effect=update), \
                patch.object(release, "source", side_effect=lambda name, *_:
                             archive(b"wrong") if name == source_mismatch else self.packages[name]), \
                patch.object(release, "publish", side_effect=publish), \
                patch.object(release.release, "verify_version"), \
                patch.object(release, "verify_rules", return_value=deepcopy(self.rules)):
            release.forward_resume("token", self.packages,
                                   {path: b"asset" for path in self.hosting["manifest"]})
        return events

    def test_excluded_function_baselines_all_required_before_any_write(self):
        self.assertEqual(len(release.EXCLUDED_NAMES), 4)
        for drift_name in release.EXCLUDED_NAMES:
            with self.subTest(name=drift_name):
                def fingerprint(value):
                    for name, original in self.excluded.items():
                        if value == original:
                            return ("incorrect" if name == drift_name
                                    else release.PLAN["functions"][name]["configurationSha256"])
                    raise AssertionError("unexpected excluded snapshot")
                with patch.object(release, "config",
                                  side_effect=lambda name, _token: deepcopy(self.excluded[name])), \
                     patch.object(release.inventory, "sanitize", side_effect=lambda value: value), \
                     patch.object(release, "digest", side_effect=fingerprint):
                    with self.assertRaisesRegex(RuntimeError,
                                                f"{drift_name}: excluded Function"):
                        release.verified_excluded_baselines("token")

    def test_excluded_function_mid_release_drift_stops_before_next_write(self):
        name = self.names[1]
        with redirect_stdout(io.StringIO()) as output, \
             self.assertRaisesRegex(RuntimeError, "outside the verified"):
            self.run_forward(excluded_drift_after=name)
        self.assertIn('"STOP_NO_RETRY": true', output.getvalue())
        self.assertIn('"uncertainWrite": "none"', output.getvalue())

    def test_excluded_function_drift_during_hosting_publication_stops(self):
        with redirect_stdout(io.StringIO()) as output, \
             self.assertRaisesRegex(RuntimeError, "excluded Function changed"):
            self.run_forward(excluded_drift_on_publish=True)
        self.assertIn('"STOP_NO_RETRY": true', output.getvalue())

    def test_readonly_forward_check_verifies_all_and_never_writes(self):
        overlay = {path: path.encode() for path in release.PLAN["hosting"]["assets"]}
        def asset_hash(body):
            return release.PLAN["hosting"]["assets"][body.decode()]["hostingHash"]
        with patch.object(release, "forward_resume_preflight",
                          return_value=(deepcopy(self.expected),
                                        {name: b"rollback" for name in self.names[1:]}, "revision")), \
             patch.object(release, "require_forward_state") as unchanged, \
             patch.object(release.inventory, "sha", side_effect=asset_hash), \
             patch.object(release, "prepare_hosting") as prepare, \
             patch.object(release.release, "source_update") as update, \
             patch.object(release, "publish") as publish, \
             redirect_stdout(io.StringIO()) as output:
            release.verify_forward_resume_readonly("token", self.packages, overlay)
        self.assertIn('"forwardResumeReadOnly": "PASS"', output.getvalue())
        self.assertIn('"productionWrites": 0', output.getvalue())
        self.assertEqual(unchanged.call_count, 1)
        prepare.assert_not_called()
        update.assert_not_called()
        publish.assert_not_called()

    def test_readonly_forward_check_fails_closed_on_drift_without_writes(self):
        overlay = {path: path.encode() for path in release.PLAN["hosting"]["assets"]}
        for path in overlay:
            with self.subTest(path=path):
                drift = deepcopy(self.expected)
                drift["hosting"]["manifest"][path] = "drift"
                with patch.object(release, "forward_resume_preflight",
                                  return_value=(drift, {}, "revision")), \
                     patch.object(release, "prepare_hosting") as prepare, \
                     patch.object(release.release, "source_update") as update, \
                     patch.object(release, "publish") as publish, \
                     redirect_stdout(io.StringIO()) as output, \
                     self.assertRaises(SystemExit):
                    release.verify_forward_resume_readonly("token", self.packages, overlay)
                self.assertIn('"forwardResumeReadOnly": "FAIL"', output.getvalue())
                prepare.assert_not_called()
                update.assert_not_called()
                publish.assert_not_called()

    def test_success_updates_only_seven_then_publishes_eleven_assets(self):
        events = self.run_forward()
        self.assertEqual(events, [*self.names[1:], "Hosting"])
        self.assertNotIn(release.RESTORE_NAME, events)
        self.assertEqual(len(release.PLAN["hosting"]["assets"]), 11)

    def test_first_fingerprint_and_each_remaining_fingerprint_are_required(self):
        first = serving(release.RESTORE_NAME, release.RESTORATION["servingRevision"])
        with patch.object(release, "config", return_value=first), \
                patch.object(release.inventory, "sanitize", return_value={}), \
                patch.object(release, "digest", return_value="wrong"):
            with self.assertRaisesRegex(RuntimeError, "First Function configuration"):
                release.forward_resume_preflight("token", self.packages)
        for name in self.names[1:]:
            with self.subTest(name=name), \
                    patch.object(release.inventory, "sanitize", return_value={}), \
                    patch.object(release, "digest", return_value="wrong"):
                with self.assertRaisesRegex(RuntimeError, name):
                    release.verify_original_function_baseline(name, self.before[name])

    def test_missing_or_mismatched_rollback_archive_stops_preflight(self):
        with patch.object(release, "config", side_effect=[self.before[self.names[0]],
                                                          self.before[self.names[1]]]), \
                patch.object(release, "digest", side_effect=[
                    release.RESTORATION["configurationSha256"],
                    release.PLAN["functions"][self.names[1]]["configurationSha256"]]), \
                patch.object(release, "verify_release_permissions"), \
                patch.object(release, "verify_function_healthy", return_value="revision"), \
                patch.object(release, "diagnose_release_10",
                             return_value={"sourceFilesMatch": True,
                                           "liveArchiveSha256": release.RESTORATION["candidateArchiveSha256"]}), \
                patch.object(release, "pinned_recovery", side_effect=RuntimeError("rollback missing")):
            with self.assertRaisesRegex(RuntimeError, "rollback missing"):
                release.forward_resume_preflight("token", self.packages)

    def test_runtime_iam_split_or_unhealthy_traffic_stops(self):
        before = self.before[self.names[1]]
        drift = deepcopy(self.after[self.names[1]])
        drift["runIam"]["bindings"] = [{"role": "changed"}]
        with self.assertRaisesRegex(RuntimeError, "runtime or IAM"):
            release.verify_updated_runtime(self.names[1], before, drift)
        split = deepcopy(before)
        split["run"]["trafficStatuses"] = [{"revision": "a", "percent": 50},
                                             {"revision": "b", "percent": 50}]
        with self.assertRaisesRegex(RuntimeError, "traffic"):
            release.verify_healthy_serving(split, name=self.names[1])

    def test_hosting_or_rules_drift_uses_actual_comparison(self):
        with patch.object(release, "forward_state", return_value={**self.expected, "rules": {"new": True}}):
            with self.assertRaisesRegex(RuntimeError, "outside the verified"):
                release.require_forward_state("token", self.expected)
        changed = deepcopy(self.expected)
        changed["hosting"]["active"] = ("new", "version")
        with patch.object(release, "forward_state", return_value=changed):
            with self.assertRaisesRegex(RuntimeError, "outside the verified"):
                release.require_forward_state("token", self.expected)

    def test_uncertain_function_update_and_hosting_failure_stop_without_retry(self):
        with redirect_stdout(io.StringIO()) as output, self.assertRaisesRegex(RuntimeError, "uncertain"):
            self.run_forward(update_error=self.names[2])
        self.assertIn('"STOP_NO_RETRY": true', output.getvalue())
        with redirect_stdout(io.StringIO()) as output, self.assertRaisesRegex(RuntimeError, "publish failed"):
            self.run_forward(publish_error=RuntimeError("publish failed"))
        self.assertIn('"uncertainWrite": "Hosting publication"', output.getvalue())

    def test_candidate_source_hash_mismatch_stops_without_advancing(self):
        name = self.names[1]
        with redirect_stdout(io.StringIO()) as output, \
                self.assertRaisesRegex(RuntimeError, "candidate source file hashes"):
            self.run_forward(source_mismatch=name)
        self.assertIn(f'"uncertainWrite": "{name}"', output.getvalue())

    def test_distinct_authorization_and_existing_guards(self):
        repo = "raulsandoval81-maker/SandmanSystem"
        base = {"GITHUB_REPOSITORY": repo, "GITHUB_REF": "refs/heads/main",
                "GITHUB_WORKFLOW_REF": f"{repo}/.github/workflows/production-receipt-intake-release.yml@refs/heads/main",
                "CONFIRM_PROJECT": release.PROJECT, "CONFIRM_SHA": release.PLAN["candidate"]}
        with patch.dict(os.environ, base, clear=True):
            with self.assertRaisesRegex(RuntimeError, "Forward-resume"):
                release.guard(release.FORWARD_RESUME_MODE)
        with patch.dict(os.environ, {**base, "CONFIRM_RELEASE": release.FORWARD_RESUME_CONFIRMATION}, clear=True):
            release.guard(release.FORWARD_RESUME_MODE)
            with self.assertRaises(RuntimeError):
                release.guard("deploy")
        self.assertFalse(release.RESTORATION["capturedRuntimeSha256"]
                         == release.PLAN["functions"][release.RESTORE_NAME]["runtimeSha256"])


if __name__ == "__main__":
    unittest.main()
