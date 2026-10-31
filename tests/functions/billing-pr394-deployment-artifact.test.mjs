import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../../scripts/staging/prepare-exact-sha-release.mjs", import.meta.url), "utf8");
const contract = readFileSync(new URL("../../scripts/staging/billing-v1-pr394-deployment-contract.mjs", import.meta.url), "utf8");

test("PR394 gets a distinct seven-function artifact, not the historic four-function package", () => {
  assert.match(script, /billingFullReleaseId = "billing-pr394-deploy-7befb7f2"/);
  assert.match(script, /if \(release\.releaseId === billingFullReleaseId\)/);
  for (const name of [
    "recordProposalPriorPayment", "recordHistoricalCashDisposition", "issueProposalClientReview",
    "getProposalClientReview", "acceptProposalClientReview", "createProposalCheckout",
    "stripeBillingWebhook",
  ]) {
    assert.ok(script.includes(`"${name}"`), `Missing full Billing export: ${name}`);
    assert.ok(contract.includes(`"${name}"`), `Not in deployment contract: ${name}`);
  }
  assert.match(script, /exact seven-function target order/);
});

test("PR394 package retains webhook signing-secret declaration; only prior Billing packages strip it", () => {
  const oldGate = script.indexOf("if (billingReleaseIds.has(release.releaseId))");
  const fullGate = script.indexOf("if (release.releaseId === billingFullReleaseId)");
  assert.ok(oldGate >= 0 && fullGate > oldGate);
  assert.match(script.slice(oldGate, fullGate), /client\.replace\(webhookDeclaration, ""\)/);
  assert.doesNotMatch(script.slice(fullGate, script.indexOf("if (stagingEntry.includes", fullGate) + 100), /client\.replace\(webhookDeclaration/);
  assert.match(script.slice(fullGate), /stripeClient\.js/);
  assert.match(script.slice(fullGate), /Full Billing staging package is missing the Stripe webhook secret/);
});

test("Existing validation-only Billing release remains undeployable", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../scripts/staging/approved-exact-sha-releases.json", import.meta.url), "utf8"));
  const checkpoint = manifest["billing-pr394-7befb7f2"];
  assert.equal(checkpoint.validationOnly, true);
  assert.deepEqual(checkpoint.functions, []);
  assert.deepEqual(checkpoint.newFunctions, []);
  assert.equal(checkpoint.hosting, false);
});
