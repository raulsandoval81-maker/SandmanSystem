import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("scripts/staging/proposal-correction-release.json"));
const overlay = read("scripts/staging/proposal-correction-controlled-hosting.py");
const index = read("functions/src/index.ts");

test("proposal correction release is one missing callable and one Hosting asset", () => {
  assert.equal(manifest.projectId, "sandman-combat-staging");
  assert.equal(manifest.applicationSha, "786dba9824663feea4aa092a1bbe54b151c8233a");
  assert.equal(manifest.functionName, "returnProposalToDraft");
  assert.equal(manifest.runtimeServiceAccount,
    "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com");
  assert.deepEqual(manifest.secrets, ["STRIPE_SECRET_KEY"]);
  assert.deepEqual(manifest.hostingAssets, ["/connect/proposals/proposal-safeguards.js"]);
  assert.equal(manifest.deploymentAuthorized, false);
  assert.equal(manifest.productionAuthorized, false);
  assert.equal(manifest.rollbackAutomatic, false);
  assert.match(index, /returnProposalToDraft/);
});

test("Hosting overlay preserves the live version and fails closed outside one file", () => {
  assert.match(overlay, /choices=\("verify", "deploy"\)/);
  assert.match(overlay, /Incomplete Hosting inventory/);
  assert.match(overlay, /Missing staging isolation marker/);
  assert.match(overlay, /Hosting change differs from the one-file allowlist/);
  assert.match(overlay, /Hosting requested an unrelated file upload/);
  assert.match(overlay, /Hosting release changed while preparing the overlay/);
  assert.match(overlay, /APPROVE_STAGING_PROPOSAL_CORRECTION_ONE_FUNCTION_ONE_ASSET/);
  assert.match(overlay, /PROPOSAL_CORRECTION_FUNCTION_VERIFIED/);
  assert.doesNotMatch(overlay, /sandmandashboard/);
});
