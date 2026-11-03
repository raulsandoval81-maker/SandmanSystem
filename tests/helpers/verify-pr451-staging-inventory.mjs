import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2];
if (!root) throw new Error("Usage: verify-pr451-staging-inventory.mjs <evidence-dir>");
const read = async name => JSON.parse(await readFile(path.join(root, `${name}.json`), "utf8"));
const expectedEnvironment = {
  SANDMAN_STAGING_ACK: "sandman-combat-staging",
  SANDMAN_STAGING_PROJECT_ID: "sandman-combat-staging",
  SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT:
    "sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com",
};

for (const [name, runtime, secrets] of [
  ["recordProposalPrepaidCash", "991554514268-compute@developer.gserviceaccount.com", []],
  ["createProposalCheckout", "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com", ["STRIPE_SECRET_KEY"]],
]) {
  const value = await read(name);
  assert.equal(value.name, `projects/sandman-combat-staging/locations/us-central1/functions/${name}`);
  assert.equal(value.environment, "GEN_2");
  assert.equal(value.state, "ACTIVE");
  assert.equal(value.buildConfig?.runtime, "nodejs22");
  assert.equal(value.buildConfig?.entryPoint, name);
  assert.equal(value.serviceConfig?.serviceAccountEmail, runtime);
  for (const [key, expected] of Object.entries(expectedEnvironment)) {
    assert.equal(value.serviceConfig?.environmentVariables?.[key], expected);
  }
  assert.deepEqual((value.serviceConfig?.secretEnvironmentVariables || []).map(item => item.key).sort(), secrets);
  assert.ok(value.buildConfig?.source?.storageSource?.object);
  assert.ok(value.buildConfig?.source?.storageSource?.generation);
}

for (const name of ["getProposalEnrollment", "saveProposalEnrollmentAgreement"]) {
  const value = await read(name);
  assert.equal(value.name, `projects/sandman-combat-staging/locations/us-central1/functions/${name}`);
  assert.equal(value.environment, "GEN_2");
  assert.equal(value.state, "ACTIVE");
  assert.equal(value.buildConfig?.runtime, "nodejs22");
  assert.equal(value.buildConfig?.entryPoint, name);
  assert.equal(value.serviceConfig?.serviceAccountEmail,
    "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com");
  assert.equal(value.serviceConfig?.ingressSettings, "ALLOW_ALL");
  for (const [key, expected] of Object.entries(expectedEnvironment)) {
    assert.equal(value.serviceConfig?.environmentVariables?.[key], expected);
  }
  assert.deepEqual(value.serviceConfig?.secretEnvironmentVariables || [], []);
  assert.equal(value.buildConfig?.source?.storageSource?.object, `${name}/function-source.zip`);
  assert.ok(value.buildConfig?.source?.storageSource?.generation);
  assert.equal(value.buildConfig?.sourceProvenance?.resolvedStorageSource?.object, `${name}/function-source.zip`);
  assert.equal(value.buildConfig?.sourceProvenance?.resolvedStorageSource?.generation,
    value.buildConfig?.source?.storageSource?.generation);
}
console.log("PASS: PR451 staging function inventory is isolated and configuration-compatible");
