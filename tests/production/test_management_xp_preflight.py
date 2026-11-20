import io
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/production"))
import management_xp_preflight as preflight


class SourceOverlayTest(unittest.TestCase):
    def setUp(self):
        workspace = tempfile.TemporaryDirectory()
        self.addCleanup(workspace.cleanup)
        self.candidate = Path(workspace.name)
        self.path = "lib/management/target.js"
        self.baseline = {
            self.path: b"old compiled JS",
            "lib/index.js": b"entry point",
            "lib/billing/unrelated.js": b"preserve exactly",
            "package.json": b"{}",
            "package-lock.json": b"{}",
        }
        self.candidate_data = b"new compiled JS"
        (self.candidate / self.path).parent.mkdir(parents=True)
        (self.candidate / self.path).write_bytes(self.candidate_data)
        self.expected = {self.path: (
            preflight.sha(self.baseline[self.path]), preflight.sha(self.candidate_data),
        )}

    def archive(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as output:
            for name, value in self.baseline.items():
                output.writestr(name, value)
        return data.getvalue()

    def test_overlay_changes_only_approved_compiled_files(self):
        archive = self.archive()
        candidate = preflight.make_overlay(archive, self.candidate, self.expected)
        expected = {**self.baseline, self.path: self.candidate_data}
        self.assertEqual(preflight.manifest(candidate),
                         {path: preflight.sha(data) for path, data in expected.items()})
        self.assertEqual(candidate, preflight.make_overlay(archive, self.candidate, self.expected))

    def test_rejects_unknown_rollback_bytes(self):
        self.baseline[self.path] = b"unverified live code"
        with self.assertRaisesRegex(RuntimeError, "Unapproved baseline"):
            preflight.make_overlay(self.archive(), self.candidate, self.expected)

    def test_rejects_regenerated_candidate_bytes(self):
        (self.candidate / self.path).write_bytes(b"unreviewed rebuild")
        with self.assertRaisesRegex(RuntimeError, "Unapproved candidate"):
            preflight.make_overlay(self.archive(), self.candidate, self.expected)

    def test_rejects_unsafe_archive_paths(self):
        self.baseline["lib/../unrelated.js"] = b"unsafe entry"
        with self.assertRaisesRegex(RuntimeError, "Unsupported or duplicate"):
            preflight.manifest(self.archive())

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
                self.assertIn(self.revision, log.getvalue())
                self.assertIn(self.image_digest, log.getvalue())
