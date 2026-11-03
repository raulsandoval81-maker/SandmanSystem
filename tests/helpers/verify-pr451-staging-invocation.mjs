import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

export function verifyInvocation(name, service, iam) {
  const expectedService = name.toLowerCase();
  const serviceName = String(service.metadata?.name || service.name || "");
  assert.ok(serviceName === expectedService || serviceName.endsWith(`/services/${expectedService}`),
    `${name}: unexpected Cloud Run service name`);

  // gcloud Run may return Knative-style annotations or the Cloud Run v2 field.
  const flag = service.invokerIamDisabled ??
    service.metadata?.annotations?.["run.googleapis.com/invoker-iam-disabled"];
  assert.ok(flag === true || flag === "true",
    `${name}: invoker IAM check is enabled or could not be verified; block release`);

  const ingress = service.ingress ?? service.metadata?.annotations?.["run.googleapis.com/ingress"];
  assert.ok(ingress === "all" || ingress === "INGRESS_TRAFFIC_ALL",
    `${name}: unexpected ingress configuration`);

  // Empty IAM policies can legitimately have no bindings, but must include
  // the etag proving the policy was actually returned by Cloud Run.
  assert.ok(iam && typeof iam.etag === "string" && iam.etag.length > 0 &&
    (iam.bindings === undefined || Array.isArray(iam.bindings)),
    `${name}: IAM policy unreadable`);
  for (const binding of iam.bindings || []) {
    assert.ok(!(binding.members || []).some(member =>
      member === "allUsers" || member === "allAuthenticatedUsers"),
      `${name}: unexpected public IAM principal`);
  }
}

if (process.argv[1]?.endsWith("verify-pr451-staging-invocation.mjs")) {
  const root = process.argv[2];
  if (!root) throw new Error("Usage: verify-pr451-staging-invocation.mjs <evidence-dir>");
  for (const name of ["getProposalEnrollment", "saveProposalEnrollmentAgreement"]) {
    const service = JSON.parse(await readFile(path.join(root, `${name}-run-service.json`), "utf8"));
    const iam = JSON.parse(await readFile(path.join(root, `${name}-run-iam.json`), "utf8"));
    verifyInvocation(name, service, iam);
  }
  console.log("PASS: PR451 staging enrollment callables have approved invocation configuration");
}
