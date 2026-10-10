import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyStagingBoundary } from "../../scripts/staging/verify-staging-boundary.mjs";
import { validateStagingWebConfig } from "../../scripts/staging/validate-staging-config.mjs";
import { assertSyntheticWriteSafety } from "../../functions/scripts/staging-seed-safety.mjs";

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
  await assert.rejects(verifyStagingBoundary(env), /valid Google credential JSON/);
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

test("staging boundary accepts only the approved GitHub WIF provider and deployer", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sandman-staging-wif-"));
  const credentialPath = path.join(directory, "credential.json");
  const email = "sandman-staging-deployer@sandman-combat-staging.iam.gserviceaccount.com";
  const credential = {
    type: "external_account",
    audience: "//iam.googleapis.com/projects/991554514268/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-github-actions",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:generateAccessToken`,
  };
  await writeFile(credentialPath, JSON.stringify(credential));
  const env = {
    SANDMAN_STAGING_PROJECT_ID: "sandman-combat-staging",
    SANDMAN_STAGING_ACK: "sandman-combat-staging",
    SANDMAN_STAGING_SERVICE_ACCOUNT_EMAIL: email,
    GOOGLE_APPLICATION_CREDENTIALS: credentialPath,
  };
  assert.equal((await verifyStagingBoundary(env)).serviceAccountEmail, email);
  await writeFile(credentialPath, JSON.stringify({ ...credential, audience: "//iam.googleapis.com/projects/991554514268/locations/global/workloadIdentityPools/other/providers/other" }));
  await assert.rejects(verifyStagingBoundary(env), /provider/);
});

test("staging deployment is manual, explicit, and bound to verified identities", async () => {
  const deploy = await read("scripts/staging/deploy-staging.mjs");
  assert.match(deploy, /verifyStagingBoundary/);
  assert.match(deploy, /validateStagingWebConfig/);
  assert.match(deploy, /DEPLOY:\$\{boundary\.projectId\}/);
  assert.match(deploy, /--config", "firebase\.staging\.json/);
  assert.match(deploy, /--project", boundary\.projectId/);
  assert.match(deploy, /hosting,functions:skillCheckCoachCall,firestore:rules/);
  assert.doesNotMatch(deploy, /,storage/);
  assert.doesNotMatch(deploy, /sandmandashboard/);
});

test("synthetic seed preflight rejects top-level and nested non-synthetic collisions", () => {
  const paths = [
    "athletes/staging-athlete-beginner",
    "practiceSessions/staging-wrestling-practice/athletes/staging-athlete-beginner",
    "practiceSessions/staging-wrestling-history/athletes/staging-athlete-advanced/verifiedSkills/wrestling__double_leg",
  ];
  const snapshots = paths.map(path => ({ ref: { path }, exists: false, get: () => undefined }));
  assert.doesNotThrow(() => assertSyntheticWriteSafety(snapshots, paths));
  for (const collisionIndex of [0, 1, 2]) {
    const collision = snapshots.map((snapshot, index) => index === collisionIndex
      ? { ref: snapshot.ref, exists: true, get: () => false }
      : snapshot);
    assert.throws(() => assertSyntheticWriteSafety(collision, paths), new RegExp(paths[collisionIndex].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("synthetic seed preflight rejects incomplete or reordered path inspection", () => {
  const paths = ["one/doc", "two/doc/nested/item"];
  const snapshots = paths.map(path => ({ ref: { path }, exists: true, get: key => key === "synthetic" }));
  assert.throws(() => assertSyntheticWriteSafety(snapshots.slice(0, 1), paths), /every intended path/);
  assert.throws(() => assertSyntheticWriteSafety([...snapshots].reverse(), paths), /ordering mismatch/);
});

test("Phase 5 fixture includes deterministic mixed readiness and failure scenarios", async () => {
  const seed = await read("functions/scripts/seed-wrestling-staging.mjs");
  assert.match(seed, /staging-athlete-beginner/);
  assert.match(seed, /staging-athlete-intermediate/);
  assert.match(seed, /staging-athlete-advanced/);
  assert.match(seed, /missing-evidence/);
  assert.match(seed, /stale-evidence/);
  assert.match(seed, /conflicting-evidence/);
  assert.match(seed, /interrupted-recovery/);
  assert.match(seed, /duplicate-retry/);
  assert.match(seed, /eligibleForAuto: false/);
  assert.match(seed, /xpAwarded: false/);
});
