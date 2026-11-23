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


class RecoveryStorageAccessTest(unittest.TestCase):
    def test_reports_only_email_and_checks_both_objects_after_expected_denial(self):
        email = "example@project.iam.gserviceaccount.com"
        generation = preflight.SANITIZED_CONFIG["generation"]
        denial = f"UNVERIFIED: retained sanitized configuration generation {generation} read returned HTTP 403"
        with tempfile.TemporaryDirectory() as directory:
            credentials = Path(directory) / "credentials.json"
            credentials.write_text(json.dumps({
                "type": "service_account", "client_email": email, "private_key": "private-key",
            }))
            with patch.dict(preflight.os.environ, {"CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE": str(credentials)}), \
                    patch.object(preflight, "require_workflow_scope") as scope, \
                    patch.object(preflight, "access_token", return_value="private-token"), \
                    patch.object(preflight, "read_retained", side_effect=[RuntimeError(denial), b"private-zip"]) as read, \
                    redirect_stdout(io.StringIO()) as output:
                with self.assertRaisesRegex(RuntimeError, "one or more pinned recovery reads"):
                    preflight.recovery_storage_access()
                scope.assert_called_once_with()
                self.assertEqual([call.args[0] for call in read.call_args_list],
                                 [preflight.SANITIZED_CONFIG, preflight.recovery.BASELINE])
                self.assertIn(email, output.getvalue())
                self.assertIn(denial, output.getvalue())
                self.assertNotIn("private-", output.getvalue())


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
        with patch.object(preflight.urllib.request, "build_opener") as opener:
            with self.assertRaisesRegex(RuntimeError, "Unexpected recovery object"):
                preflight.read_retained({**preflight.SANITIZED_CONFIG, "generation": "1"}, "token")
            opener.assert_not_called()
            request_open = opener.return_value.open
            request_open.return_value.__enter__.return_value.read.return_value = b"wrong"
            with self.assertRaisesRegex(RuntimeError, "hash mismatch"):
                preflight.read_retained(preflight.SANITIZED_CONFIG, "token")
            request = request_open.call_args.args[0]
            self.assertEqual(request.full_url,
                "https://storage.googleapis.com/storage/v1/b/sandman-xp-recovery-889326401061"
                "/o/xp-recovery%2Fproduction-config-sanitized.json?alt=media&generation=1795226241121217")
            self.assertEqual(request.get_header("Authorization"), "Bearer token")

    def test_retained_read_reports_http_status_without_raw_error(self):
        for status in (401, 403, 404):
            with self.subTest(status=status), patch.object(preflight.urllib.request, "build_opener") as opener:
                opener.return_value.open.side_effect = preflight.urllib.error.HTTPError(
                    "https://private", status, "private error", {}, None,
                )
                with self.assertRaisesRegex(RuntimeError, f"generation 1795226241121217 read returned HTTP {status}") as raised:
                    preflight.read_retained(preflight.SANITIZED_CONFIG, "token")
                self.assertNotIn("private", str(raised.exception))

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

    def test_historical_revision_change_is_not_configuration_drift(self):
        fn = {
            "name": "function", "state": "ACTIVE",
            "buildConfig": {"runtime": "nodejs22", "entryPoint": "xp"},
            "serviceConfig": {"revision": "new-ready-revision",
                              "ingressSettings": "ALLOW_INTERNAL_ONLY",
                              "serviceAccountEmail": "service@example.invalid"},
        }
        historical = preflight.sanitized_configuration(fn)
        historical["serviceConfig"]["revision"] = "old-retained-revision"
        preflight.verify_sanitized_configuration(fn, historical)
        historical["serviceConfig"]["ingressSettings"] = "ALLOW_ALL"
        with self.assertRaisesRegex(RuntimeError, "configuration drift"):
            preflight.verify_sanitized_configuration(fn, historical)
        historical["serviceConfig"]["ingressSettings"] = "ALLOW_INTERNAL_ONLY"
        historical["serviceConfig"]["serviceAccountConfigured"] = False
        with self.assertRaisesRegex(RuntimeError, "configuration drift"):
            preflight.verify_sanitized_configuration(fn, historical)

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



class CloudBuildSourceReferenceTest(unittest.TestCase):
    def setUp(self):
        self.source = dict(preflight.HISTORICAL_BUILD_SOURCE)

    def test_source_from_cloud_build_config_when_resolved_provenance_missing(self):
        record = {"source": {"storageSource": dict(self.source)}}
        self.assertEqual(preflight.source_ref(record), self.source)

    def test_source_provenance_and_configured_source_must_agree(self):
        record = {
            "sourceProvenance": {"resolvedStorageSource": dict(self.source)},
            "source": {"storageSource": dict(self.source)},
        }
        self.assertEqual(preflight.source_ref(record), self.source)
        record["source"]["storageSource"]["generation"] = "1791403756604187"
        with self.assertRaisesRegex(RuntimeError, "CONFLICTING"):
            preflight.source_ref(record)

    def test_missing_or_unpinned_source_fails_closed(self):
        for record in (
            {},
            {"source": {"storageSource": {}}},
            {"source": {"storageSource": {**self.source, "generation": "0"}}},
            {"source": {"storageSource": {**self.source, "generation": ""}}},
            {"source": {"storageSource": {**self.source, "bucket": "other-bucket"}}},
            {"source": {"storageSource": {**self.source, "object": "other.zip"}}},
        ):
            with self.subTest(record=record), self.assertRaises(RuntimeError):
                preflight.source_ref(record)


class SafeCommandFailureTest(unittest.TestCase):
    def test_external_command_failure_does_not_expose_arguments_or_output(self):
        import subprocess
        failure = subprocess.CalledProcessError(
            7, ["gcloud", "storage", "cat", "gs://private/token"], output="secret-value",
            stderr="private-error")
        detail = preflight.safe_error_detail(failure)
        self.assertIn("UNVERIFIED", detail)
        self.assertIn("exit code 7", detail)
        for private in ("private", "secret-value", "storage", "cat"):
            self.assertNotIn(private, detail)

    def test_other_failure_keeps_safe_error_type(self):
        self.assertEqual(preflight.safe_error_detail(ValueError("private")), "ValueError")


class ProtectedGcloudDiagnosticsTest(unittest.TestCase):
    def test_each_operation_reports_fixed_stage_without_sensitive_arguments(self):
        import subprocess
        for stage in (
            "historical Cloud Build metadata read",
            "serving Cloud Run revision metadata read",
        ):
            with self.subTest(stage=stage), patch.object(
                preflight.subprocess, "check_output",
                side_effect=subprocess.CalledProcessError(
                    1, ["gcloud", "storage", "cat", "gs://private-token"],
                    output=b"secret-output", stderr=b"secret-error",
                ),
            ):
                with self.assertRaises(RuntimeError) as captured:
                    preflight.guarded_gcloud(stage, ["gcloud", "private-argument"])
                detail = str(captured.exception)
                self.assertIn(stage, detail)
                self.assertIn("exit code 1", detail)
                for private in ("private-token", "private-argument", "secret-output", "secret-error"):
                    self.assertNotIn(private, detail)


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



class PinnedHistoricalImageExceptionTest(unittest.TestCase):
    def setUp(self):
        self.build = {"status": "SUCCESS", "results": {"images": []}}
        self.source = preflight.HISTORICAL_BUILD_SOURCE

    def check(self, build=None, source=None, revision=None, image=None, resource=None):
        return preflight.verify_pinned_historical_exception(
            build if build is not None else self.build,
            resource if resource is not None else preflight.HISTORICAL_BUILD,
            image if image is not None else preflight.HISTORICAL_IMAGE,
            revision if revision is not None else preflight.HISTORICAL_REVISION,
            source if source is not None else self.source,
        )

    def test_explicit_acknowledgement_is_required(self):
        with patch.dict(preflight.os.environ, {"HISTORICAL_PROVENANCE_ACK": ""}), \
                self.assertRaisesRegex(RuntimeError, "approval missing"):
            self.check()

    def test_exact_old_revision_digest_build_and_source_only(self):
        with patch.dict(preflight.os.environ, {
            "HISTORICAL_PROVENANCE_ACK": preflight.HISTORICAL_EXCEPTION_ACK,
        }), redirect_stdout(io.StringIO()) as capture:
            self.check()
            self.assertIn("HISTORICAL_IMAGE_PROVENANCE_UNVERIFIED_EXCEPTION", capture.getvalue())
            for key, value in (
                ("revision", "some-other-revision"),
                ("image", self.source["object"]),
                ("resource", "projects/sandmandashboard/locations/us-central1/builds/not-the-build"),
                ("source", {**self.source, "generation": "1"}),
            ):
                with self.subTest(key=key), self.assertRaises(RuntimeError):
                    self.check(**{key: value})

    def test_nonempty_conflicting_build_images_cannot_be_waived(self):
        with patch.dict(preflight.os.environ, {
            "HISTORICAL_PROVENANCE_ACK": preflight.HISTORICAL_EXCEPTION_ACK,
        }), self.assertRaisesRegex(RuntimeError, "conflicting image evidence"):
            self.check(build={"status": "SUCCESS", "results": {"images": [
                {"name": "other", "digest": "sha256:" + "b" * 64},
            ]}})


class RegistryProvenanceFallbackTest(unittest.TestCase):
    image = "us-central1-docker.pkg.dev/sandmandashboard/gcf-artifacts/newxp@sha256:" + "a" * 64
    build = "projects/889326401061/locations/us-central1/builds/abcd-1234"
    revision = "createmanagementxpadjustment-00020-abc"

    def evidence(self, invocation=None, digest=None):
        digest = digest or "a" * 64
        build_id = self.build.rsplit("/", 1)[-1]
        return {
            "image_summary": {
                "fully_qualified_digest": self.image,
                "digest": "sha256:" + "a" * 64,
            },
            "provenance_summary": {"provenance": [{
                "build": {"inTotoSlsaProvenanceV1": {
                    "predicateType": "https://slsa.dev/provenance/v1",
                    "predicate": {"runDetails": {"metadata": {
                        "invocationId": invocation or
                        f"https://cloudbuild.googleapis.com/v1/projects/889326401061/locations/us-central1/builds/{build_id}",
                    }}},
                    "subject": [{
                        "name": "https://" + self.image.split("@", 1)[0],
                        "digest": {"sha256": digest},
                    }],
                }},
                "envelope": {"signatures": [{"sig": "test-fixture"}]},
            }]},
        }

    def test_exact_google_managed_build_image_link_accepted(self):
        with patch.object(preflight, "guarded_gcloud", return_value=json.dumps(self.evidence()).encode()) as read, \
                redirect_stdout(io.StringIO()) as capture:
            preflight.verify_artifact_registry_provenance(
                {"status": "SUCCESS"}, self.build, self.image, self.revision)
            self.assertIn("GOOGLE_MANAGED_ARTIFACT_PROVENANCE_MATCH", capture.getvalue())
            self.assertFalse(json.loads(capture.getvalue())["signatureValidatedLocally"])
            self.assertIn("--show-provenance", read.call_args.args[1])

    def test_wrong_build_digest_or_missing_signature_fails_closed(self):
        cases = [
            self.evidence(invocation="https://cloudbuild.googleapis.com/v1/projects/other/locations/us-central1/builds/bad"),
            self.evidence(digest="b" * 64),
            self.evidence(),
        ]
        cases[2]["provenance_summary"]["provenance"][0]["envelope"]["signatures"] = []
        for record in cases:
            with self.subTest(record=record["provenance_summary"]["provenance"][0]), \
                    patch.object(preflight, "guarded_gcloud", return_value=json.dumps(record).encode()), \
                    self.assertRaisesRegex(RuntimeError, "does not link"):
                preflight.verify_artifact_registry_provenance(
                    {"status": "SUCCESS"}, self.build, self.image, self.revision)

    def test_missing_artifact_registry_image_fails_closed(self):
        with patch.object(preflight, "guarded_gcloud", side_effect=RuntimeError("UNVERIFIED: not found")), \
                self.assertRaisesRegex(RuntimeError, "not found"):
            preflight.verify_artifact_registry_provenance(
                {"status": "SUCCESS"}, self.build, self.image, self.revision)
