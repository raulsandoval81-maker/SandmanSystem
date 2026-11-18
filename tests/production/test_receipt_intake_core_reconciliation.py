"""Offline Core reconciliation tests; no production network calls."""
from copy import deepcopy
from unittest.mock import Mock, patch
import io
import json
import unittest
import zipfile
from contextlib import redirect_stdout

import receipt_intake_release as release


def archive(payload):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("index.js", payload)
    return out.getvalue()


class CoreReconciliationTest(unittest.TestCase):
    def setUp(self):
        self.packages = {name: archive(b"candidate") for name in release.NAMES}
        self.overlay = {path: b"candidate-ui" for path in release.PLAN["hosting"]["assets"]}
        self.snapshot = {"function": {"state": "ACTIVE"}, "iam": {"bindings": []},
                         "run": {"trafficStatuses": [{"percent": 100}]}, "runIam": {}}
        self.site = ("sites/sandman-main/releases/test", "sites/sandman-main/versions/test")
        self.manifest = {path: release.inventory.sha(body)
                         for path, body in self.overlay.items()}
        self.manifest["/unrelated"] = "a" * 64
        self.pinned_ui = {"/waiver/index.html", "/intake-parent/parent.intake.js",
                          "/intake-athlete/athlete.intake.js"}

    def mocks(self):
        return (
            patch.object(release, "config", return_value=deepcopy(self.snapshot)),
            patch.object(release, "verify_function_healthy", return_value="revision"),
            patch.object(release, "source", return_value=archive(b"candidate")),
            patch.object(release, "runtime", return_value={"function": {"runtime": "nodejs22"},
                                                          "transport": {"functions": {}}}),
            patch.object(release, "active", return_value=self.site),
            patch.object(release, "get", return_value={"status": "FINALIZED", "config": {"redirects": []},
                                                       "fileCount": len(self.manifest)}),
            patch.object(release.inventory, "manifest", return_value=deepcopy(self.manifest)),
            patch.object(release.subprocess, "check_output",
                         return_value=release.PLAN["hosting"]["uiCandidate"] + "\n"),
            patch.object(release.Path, "read_bytes", return_value=b"pinned-ui"),
            patch.object(release.subprocess, "run", return_value=Mock(stdout=b"pinned-ui-gzip")),
            patch.object(release.release, "source_update"),
            patch.object(release.release, "write"),
            patch.object(release, "publish"),
        )

    def test_reports_only_current_state_and_never_writes(self):
        context = self.mocks()
        with context[0], context[1], context[2], context[3], context[4], context[5], \
             context[6], context[7], context[8], context[9], context[10] as update, \
             context[11] as write, context[12] as publish, redirect_stdout(io.StringIO()) as stdout:
            result = release.reconcile_core_readonly("token", self.packages, self.overlay)
        self.assertEqual(result["mode"], "CORE_READ_ONLY_RECONCILIATION")
        self.assertFalse(result["writesAuthorized"])
        self.assertEqual(len(result["functions"]), 8)
        self.assertTrue(all(f["sourceMatchesPinnedCandidate"] for f in result["functions"].values()))
        self.assertFalse(result["hosting"]["allThreeUiFilesMatchPinnedRelease"])
        self.assertEqual(result["hosting"]["coreCandidateDifferingPaths"], [])
        self.assertEqual(json.loads(stdout.getvalue()), result)
        update.assert_not_called()
        write.assert_not_called()
        publish.assert_not_called()

    def test_unverified_cloud_function_drift_fails_closed(self):
        contexts = self.mocks()
        first = deepcopy(self.snapshot)
        second = deepcopy(self.snapshot)
        second["iam"]["etag"] = "changed"
        with contexts[0] as cfg, contexts[1], contexts[2], contexts[3], \
             contexts[4], contexts[5], contexts[6], contexts[7], contexts[8], \
             contexts[9], contexts[10] as update:
            cfg.side_effect = [first, second]
            with self.assertRaisesRegex(RuntimeError, "configuration changed"):
                release.reconcile_core_readonly("token", self.packages, self.overlay)
        update.assert_not_called()

    def test_missing_package_and_extra_overlay_are_rejected_without_api_calls(self):
        with patch.object(release, "config") as cfg:
            with self.assertRaisesRegex(RuntimeError, "eight pinned"):
                release.reconcile_core_readonly("token", {}, self.overlay)
            with self.assertRaisesRegex(RuntimeError, "candidate scope changed"):
                release.reconcile_core_readonly("token", self.packages,
                                                {**self.overlay, "/unapproved": b"x"})
            cfg.assert_not_called()

    def test_unchanged_web_manifest_is_required(self):
        contexts = self.mocks()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4], \
             contexts[5] as version, contexts[6], contexts[7], contexts[8], contexts[9]:
            version.return_value["fileCount"] = len(self.manifest) + 1
            with self.assertRaisesRegex(RuntimeError, "Incomplete current Hosting manifest"):
                release.reconcile_core_readonly("token", self.packages, self.overlay)


if __name__ == "__main__":
    unittest.main()
