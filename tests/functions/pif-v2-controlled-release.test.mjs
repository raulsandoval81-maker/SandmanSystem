import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const text = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const manifest = JSON.parse(text("scripts/staging/pif-v2-controlled-release.json"));
const workflow = text(".github/workflows/paid-in-full-v2-readonly-preflight.yml");
const overlay = text("scripts/staging/pif-v2-controlled-hosting.py");

test("one-function four-asset release manifest remains exact, staging-only and not self-authorizing", () => {
  assert.equal(manifest.projectId, "sandman-combat-staging");
  assert.equal(manifest.applicationSha, "7df9dce66939cae693d4f112647da7bdd17e923c");
  assert.equal(manifest.functionName, "recordProposalPrepaidCash");
  assert.equal(manifest.functionRevisionBefore, "recordproposalprepaidcash-00006-foj");
  assert.equal(manifest.runtimeServiceAccount, "991554514268-compute@developer.gserviceaccount.com");
  assert.equal(manifest.hostingVersionBefore, "sites/sandman-combat-staging/versions/2d9f85c64cc4c1b7");
  assert.deepEqual(manifest.hostingAssets, [
    "/assets/js/pricing/sandman-pricing-catalog.js",
    "/assets/js/pricing/sandman-pricing-engine.js",
    "/management/billing/billing.js",
    "/management/billing/prepaid-terms.js",
  ]);
  assert.equal(manifest.deploymentAuthorized, false);
  assert.equal(manifest.productionAuthorized, false);
  assert.equal(manifest.rollbackAutomatic, false);
});

test("staging workflow retains read-only preflight as the default and gates mutation separately", () => {
  assert.match(workflow, /default: validate/);
  assert.match(workflow, /options: \[validate, deploy\]/);
  assert.match(workflow, /if: \$\{\{ inputs\.action == 'deploy' \}\}/);
  assert.match(workflow, /needs: validate/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /APPROVE_PIF_V2_STAGING_ONE_FUNCTION_FOUR_ASSETS/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /ref: 7df9dce66939cae693d4f112647da7bdd17e923c/);
  assert.match(workflow, /source\.functions/);
  assert.doesNotMatch(workflow, /--project[=\s]+sandmandashboard/);
});

test("deployment stays on existing WIF-approved workflow and targets one named callable", () => {
  assert.equal((workflow.match(/gcloud functions deploy /g) || []).length, 1);
  assert.match(workflow, /gcloud functions deploy recordProposalPrepaidCash --gen2/);
  assert.match(workflow, /--run-service-account=991554514268-compute@developer.gserviceaccount.com/);
  assert.match(workflow, /--build-service-account=projects\/sandman-combat-staging/);
  assert.match(workflow, /--entry-point=recordProposalPrepaidCash/);
  assert.match(workflow, /read-only staging preflight/);
  assert.match(workflow, /diff -u .*function-iam-before/);
  assert.match(workflow, /diff -u .*run-iam-before/);
  assert.match(workflow, /FUNCTION_DEPLOYMENT_VERIFIED/);
  assert.match(workflow, /PIF_V2_FUNCTION_DEPLOYED_AND_VERIFIED: yes/);
});

test("Hosting helper fails closed on baseline change and cannot publish unapproved files", () => {
  assert.match(overlay, /mode", required=True, choices=\("verify", "deploy"\)/);
  assert.match(overlay, /hostingReleaseBefore/);
  assert.match(overlay, /hostingVersionBefore/);
  assert.match(overlay, /Staging Hosting baseline drifted/);
  assert.match(overlay, /if set\(changed\) != set\(m\["hostingAssets"\]\)/);
  assert.match(overlay, /Unrelated file upload|unrelated file upload/);
  assert.match(overlay, /PIF_V2_FUNCTION_DEPLOYED_AND_VERIFIED/);
  assert.match(overlay, /APPROVE_PIF_V2_STAGING_ONE_FUNCTION_FOUR_ASSETS/);
  assert.match(overlay, /rollbackVersion/);
  assert.doesNotMatch(overlay, /sandmandashboard/);
});
