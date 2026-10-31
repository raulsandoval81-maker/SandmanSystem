import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BILLING_V1_SOURCE_SHA,
  BILLING_V1_STAGING_PROJECT,
  BILLING_V1_REQUIRED_CALLABLES,
  BILLING_V1_REQUIRED_WEBHOOK,
  BILLING_V1_SECRET_BINDINGS,
  BILLING_V1_MANAGEMENT_UI,
  validateBillingDeploymentContract,
} from "../../scripts/staging/billing-v1-pr394-deployment-contract.mjs";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const proposed = () => ({
  applicationSha: BILLING_V1_SOURCE_SHA,
  projectId: BILLING_V1_STAGING_PROJECT,
  hostingFiles: [...BILLING_V1_MANAGEMENT_UI],
  functions: [...BILLING_V1_REQUIRED_CALLABLES, BILLING_V1_REQUIRED_WEBHOOK],
  secrets: structuredClone(BILLING_V1_SECRET_BINDINGS),
  stripeMode: "test",
  verifiedWebhookDestination: true,
  bootstrapApproved: true,
});

test("Billing PR394 source exports the exact mandatory callable and webhook endpoints", () => {
  const index = read("functions/src/index.ts");
  for (const name of [...BILLING_V1_REQUIRED_CALLABLES, BILLING_V1_REQUIRED_WEBHOOK])
    assert.match(index, new RegExp(`\\b${name}\\b`));
  assert.equal(validateBillingDeploymentContract(proposed()), true);
});

test("Billing staging release cannot omit the webhook, family signature or cash disposition", () => {
  for (const name of [...BILLING_V1_REQUIRED_CALLABLES, BILLING_V1_REQUIRED_WEBHOOK]) {
    const candidate = proposed();
    candidate.functions = candidate.functions.filter(x => x !== name);
    assert.throws(() => validateBillingDeploymentContract(candidate), /Missing required Billing staging function/);
  }
});

test("Billing staging release rejects incomplete secrets, live Stripe or unverified bootstrap", () => {
  for (const [name, keys] of Object.entries(BILLING_V1_SECRET_BINDINGS)) {
    for (const key of keys) {
      const candidate = proposed();
      candidate.secrets[name] = keys.filter(x => x !== key);
      assert.throws(() => validateBillingDeploymentContract(candidate), /Wrong staging secret binding/);
    }
  }
  for (const field of ["stripeMode", "verifiedWebhookDestination", "bootstrapApproved"]) {
    const candidate = proposed();
    candidate[field] = false;
    assert.throws(() => validateBillingDeploymentContract(candidate));
  }
  const candidate = proposed();
  candidate.stripeMode = "live";
  assert.throws(() => validateBillingDeploymentContract(candidate), /test mode/);
});

test("Billing staging release pins SHA, project and both required Hosting surfaces", () => {
  for (const file of BILLING_V1_MANAGEMENT_UI) {
    const candidate = proposed();
    candidate.hostingFiles = candidate.hostingFiles.filter(x => x !== file);
    assert.throws(() => validateBillingDeploymentContract(candidate), /Hosting overlay/);
  }
  const wrongSha = proposed();
  wrongSha.applicationSha = "f".repeat(40);
  assert.throws(() => validateBillingDeploymentContract(wrongSha), /immutable/);
  const wrongProject = proposed();
  wrongProject.projectId = "sandmandashboard";
  assert.throws(() => validateBillingDeploymentContract(wrongProject), /isolated staging/);
});

test("Prior validation checkpoint remains deliberately non-deployable", () => {
  const releases = JSON.parse(read("scripts/staging/approved-exact-sha-releases.json"));
  const validation = releases["billing-pr394-7befb7f2"];
  assert.equal(validation.validationOnly, true);
  assert.equal(validation.hosting, false);
  assert.deepEqual(validation.functions, []);
});
