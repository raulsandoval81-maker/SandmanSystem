import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/production"))
import management_xp_preflight as preflight


class CandidateManifestTest(unittest.TestCase):
    def test_merged_manifest_pins_exact_single_file_candidate(self):
        raw = preflight.MANIFEST.read_bytes()
        manifest = json.loads(raw)
        self.assertEqual(preflight.sha(raw), preflight.MANIFEST_SHA256)
        self.assertEqual(manifest["candidateSha256"], preflight.CANDIDATE_SHA256)
        self.assertEqual(list(manifest["changedEntries"]), [preflight.recovery.MANAGEMENT])
        self.assertEqual(manifest["unchangedEntryCount"], 404)
        self.assertFalse(manifest["deploymentEnabled"])

    def test_candidate_verification_requires_both_archive_digest_and_report(self):
        report = json.loads(preflight.MANIFEST.read_bytes())
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in preflight.recovery.PINNED:
                path = root / "functions" / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(name.encode())
            with patch.object(preflight.recovery, "build", return_value=(b"candidate", report)) as builder, patch.object(
                preflight, "CANDIDATE_SHA256", preflight.sha(b"candidate")
            ):
                self.assertEqual(preflight.verify_candidate(b"original", root), report)
                builder.assert_called_once_with(b"original", {name: name.encode() for name in preflight.recovery.PINNED})
                builder.return_value = (b"wrong archive", report)
                with self.assertRaisesRegex(RuntimeError, "approved single-file manifest"):
                    preflight.verify_candidate(b"original", root)
                builder.return_value = (b"candidate", {**report, "unchangedEntryCount": 403})
                with self.assertRaisesRegex(RuntimeError, "approved single-file manifest"):
                    preflight.verify_candidate(b"original", root)

    def test_retained_read_rejects_unapproved_objects_and_wrong_bytes(self):
        with patch.object(preflight.subprocess, "check_output", return_value=b"wrong") as command:
            with self.assertRaisesRegex(RuntimeError, "Unexpected recovery object"):
                preflight.read_retained({**preflight.SANITIZED_CONFIG, "generation": "1"})
            command.assert_not_called()
            with self.assertRaisesRegex(RuntimeError, "hash mismatch"):
                preflight.read_retained(preflight.SANITIZED_CONFIG)
            self.assertIn("#1795226241121217", command.call_args.args[0][3])

    def test_sanitized_configuration_does_not_include_values_or_identities(self):
        fn = {
            "name": "function", "state": "ACTIVE",
            "buildConfig": {"runtime": "nodejs22", "entryPoint": "xp", "environmentVariables": {"BUILD": "private"}},
            "serviceConfig": {"revision": "old", "environmentVariables": {"RUN": "private"},
                              "secretEnvironmentVariables": [{"secret": "private"}],
                              "serviceAccountEmail": "private"},
        }
        safe = preflight.sanitized_configuration(fn)
        self.assertEqual(safe["buildConfig"]["environmentVariableNames"], ["BUILD"])
        self.assertEqual(safe["serviceConfig"]["environmentVariableNames"], ["RUN"])
        self.assertEqual(safe["serviceConfig"]["secretEnvironmentVariableCount"], 1)
        self.assertTrue(safe["serviceConfig"]["serviceAccountConfigured"])
        self.assertNotIn("private", json.dumps(safe))

    def test_source_requires_immutable_project_generation(self):
        record = {"sourceProvenance": {"resolvedStorageSource": {
            "bucket": preflight.BUCKET,
            "object": f"{preflight.SHARED}/function-source.zip",
            "generation": "123",
        }}}
        self.assertEqual(preflight.source_ref(record)["generation"], "123")
        del record["sourceProvenance"]["resolvedStorageSource"]["generation"]
        with self.assertRaisesRegex(RuntimeError, "generation-pinned"):
            preflight.source_ref(record)


class ProtectedAuthenticationTest(unittest.TestCase):
    def test_missing_credentials_stop_before_gcloud(self):
        from unittest.mock import patch

        with patch.dict(preflight.os.environ, clear=True), patch.object(
            preflight.subprocess, "check_output"
        ) as command:
            with self.assertRaisesRegex(RuntimeError, "credentials file is missing"):
                preflight.access_token()
            command.assert_not_called()

    def test_token_uses_explicit_project_and_protected_credentials(self):
        from unittest.mock import patch

        with tempfile.NamedTemporaryFile() as credentials, patch.dict(
            preflight.os.environ, {"CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE": credentials.name}
        ), patch.object(preflight.subprocess, "check_output", return_value="fictional-token\n") as command:
            self.assertEqual(preflight.access_token(), "fictional-token")
            self.assertEqual(command.call_args.args[0],
                             ["gcloud", "auth", "print-access-token", "--quiet",
                              "--project", "sandmandashboard"])

    def test_metadata_auth_error_is_reported_once_without_token(self):
        from unittest.mock import patch

        for code, message in [(401, "rejected the protected access token"), (403, "lacks access")]:
            with self.subTest(code=code), patch.object(
                preflight.inventory, "request", side_effect=RuntimeError(f"/function: HTTP {code}")
            ) as request:
                with self.assertRaisesRegex(RuntimeError, message):
                    preflight.authenticated_get(preflight.FUNCTION, "fictional-token")
                request.assert_called_once_with(preflight.FUNCTION, "fictional-token")

    def test_empty_token_does_not_make_a_production_request(self):
        from unittest.mock import patch

        with patch.object(preflight.inventory, "request") as request:
            with self.assertRaisesRegex(RuntimeError, "unauthenticated"):
                preflight.authenticated_get(preflight.FUNCTION, "")
            request.assert_not_called()


class ServingImageProvenanceTest(unittest.TestCase):
    repository = "us-central1-docker.pkg.dev/sandmandashboard/gcf-artifacts/searchmanagementmembers"
    image_digest = "sha256:" + "a" * 64
    build = "projects/sandmandashboard/locations/us-central1/builds/1234"
    revision = "createmanagementxpadjustment-00001-abc"

    def verify(self, serving, outputs, status="SUCCESS"):
        preflight.verify_build_image(
            {"status": status, "results": {"images": outputs}}, self.build, serving, self.revision,
        )

    def test_tagged_serving_digest_matches_cloud_build_result(self):
        self.verify(f"{self.repository}:version_1@{self.image_digest}", [
            {"name": f"{self.repository}:version_1", "digest": self.image_digest},
        ])

    def test_digest_only_reference_and_registry_port(self):
        repository = "registry.example:443/project/artifacts/function"
        self.verify(f"{repository}@{self.image_digest}", [
            {"name": repository, "digest": self.image_digest},
        ])

    def test_refuses_missing_or_inconsistent_build_proof(self):
        from contextlib import redirect_stdout

        for outputs, status in [
            ([], "SUCCESS"),
            ([{"name": f"{self.repository}-other", "digest": self.image_digest}], "SUCCESS"),
            ([{"name": self.repository, "digest": "sha256:" + "b" * 64}], "SUCCESS"),
            ([{"name": self.repository, "digest": self.image_digest}], "FAILURE"),
            ([{"name": f"{self.repository}@sha256:" + "b" * 64, "digest": self.image_digest}], "SUCCESS"),
        ]:
            with self.subTest(outputs=outputs, status=status), redirect_stdout(io.StringIO()) as log:
                with self.assertRaisesRegex(RuntimeError, "does not prove provenance"):
                    self.verify(f"{self.repository}@{self.image_digest}", outputs, status)
                self.assertIn("UNVERIFIED" if not outputs else "CONFLICTING", log.getvalue())
                self.assertIn(self.revision, log.getvalue())
                self.assertIn(self.image_digest, log.getvalue())
