import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyStagingBoundary } from "../../scripts/staging/verify-staging-boundary.mjs";
import { validateStagingWebConfig } from "../../scripts/staging/validate-staging-config.mjs";

const read = path => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Wrestling staging config uses an isolated generated hosting root", async () => {
  const config = JSON.parse(await read("firebase.staging.json"));
  assert.equal(config.hosting.public, ".firebase-staging/public");
  assert.equal(config.firestore.rules, "firestore.rules");
  assert.notEqual(config.hosting.target, "sandman");
});

test("staging preparation and seeding fail closed against production", async () => {
  const [prepare, seed, runtime, boundary, validation] = await Promise.all([
    read("scripts/staging/prepare-staging-hosting.mjs"),
    read("functions/scripts/seed-wrestling-staging.mjs"),
    read("public/assets/js/firebase-init.js"),
    read("scripts/staging/verify-staging-boundary.mjs"),
    read("scripts/staging/validate-staging-config.mjs"),
  ]);
  assert.match(prepare, /validateStagingWebConfig/);
  assert.match(seed, /verifyStagingBoundary/);
  assert.match(boundary, /sandmandashboard/);
  assert.match(boundary, /SANDMAN_STAGING_ACK/);
  assert.match(validation, /PRODUCTION_PROJECT_ID/);
  assert.match(validation, /SANDMAN_STAGING_ACK/);
  assert.match(runtime, /Staging cannot use the production Firebase project/);
  assert.match(runtime, /STAGING — synthetic data only/);
});

test("staging boundary rejects missing configuration and production targeting", async () => {
  await assert.rejects(verifyStagingBoundary({}), /non-production/);
  await assert.rejects(verifyStagingBoundary({
    SANDMAN_STAGING_PROJECT_ID: "sandmandashboard",
    SANDMAN_STAGING_ACK: "sandmandashboard",
  }), /non-production/);
});

test("staging boundary verifies credential project and service-account identities", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sandman-staging-boundary-"));
  const credentialPath = path.join(directory, "credential.json");
  const base = {
    type: "service_account",
    project_id: "sandman-stage-a",
    client_email: "stage-writer@sandman-stage-a.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nsynthetic-test-only\n-----END PRIVATE KEY-----\n",
  };
  await writeFile(credentialPath, JSON.stringify(base));
  const env = {
    SANDMAN_STAGING_PROJECT_ID: "sandman-stage-a",
    SANDMAN_STAGING_ACK: "sandman-stage-a",
    SANDMAN_STAGING_SERVICE_ACCOUNT_EMAIL: base.client_email,
    GOOGLE_APPLICATION_CREDENTIALS: credentialPath,
  };
  const verified = await verifyStagingBoundary(env);
  assert.equal(verified.projectId, "sandman-stage-a");
  await assert.rejects(verifyStagingBoundary({ ...env, SANDMAN_STAGING_ACK: "wrong" }), /ACK/);
  await assert.rejects(verifyStagingBoundary({ ...env, SANDMAN_STAGING_SERVICE_ACCOUNT_EMAIL: "wrong@example.invalid" }), /identity/);
  await writeFile(credentialPath, JSON.stringify({ ...base, project_id: "different-stage" }));
  await assert.rejects(verifyStagingBoundary(env), /project identity/);
  await writeFile(credentialPath, "not-json");
  await assert.rejects(verifyStagingBoundary(env), /valid service-account JSON/);
});

test("staging web configuration must match the approved project", async () => {
  const valid = {
    SANDMAN_STAGING_PROJECT_ID: "sandman-stage-a",
    SANDMAN_STAGING_ACK: "sandman-stage-a",
    SANDMAN_STAGING_WEB_CONFIG: JSON.stringify({
      apiKey: "public-test-key", authDomain: "sandman-stage-a.firebaseapp.com",
      projectId: "sandman-stage-a", appId: "1:123:web:test",
    }),
  };
  assert.equal(validateStagingWebConfig(valid).projectId, "sandman-stage-a");
  assert.throws(() => validateStagingWebConfig({}), /non-production/);
  assert.throws(() => validateStagingWebConfig({ ...valid, SANDMAN_STAGING_PROJECT_ID: "sandmandashboard", SANDMAN_STAGING_ACK: "sandmandashboard" }), /non-production/);
  assert.throws(() => validateStagingWebConfig({ ...valid, SANDMAN_STAGING_ACK: "other" }), /ACK/);
  assert.throws(() => validateStagingWebConfig({ ...valid, SANDMAN_STAGING_WEB_CONFIG: "bad-json" }), /valid Firebase web-app JSON/);
  assert.throws(() => validateStagingWebConfig({ ...valid, SANDMAN_STAGING_WEB_CONFIG: JSON.stringify({ apiKey: "x", authDomain: "x", projectId: "other", appId: "x" }) }), /does not match/);
  assert.throws(() => validateStagingWebConfig({ ...valid, SANDMAN_STAGING_WEB_CONFIG: JSON.stringify({ authDomain: "x", projectId: "sandman-stage-a", appId: "x" }) }), /missing apiKey/);
});

test("staging deployment is manual, explicit, and bound to verified identities", async () => {
  const deploy = await read("scripts/staging/deploy-staging.mjs");
  assert.match(deploy, /verifyStagingBoundary/);
  assert.match(deploy, /validateStagingWebConfig/);
  assert.match(deploy, /DEPLOY:\$\{boundary\.projectId\}/);
  assert.match(deploy, /--config", "firebase\.staging\.json/);
  assert.match(deploy, /--project", boundary\.projectId/);
  assert.doesNotMatch(deploy, /sandmandashboard/);
});
