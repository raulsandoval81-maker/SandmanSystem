import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const { processManagementPassCheckoutCompleted } = require(`${buildRoot}/billing/managementPassWebhook.js`);

const session = {
  id: "cs_pass_1", status: "complete", payment_status: "paid", mode: "payment",
  currency: "usd", amount_total: 2500, client_reference_id: "message-1",
  payment_intent: "pi_pass_1", customer: "cus_pass_1",
  metadata: { paymentFlow: "management_pass", messageId: "message-1",
    locationId: "santa-ynez-valley", passType: "combat-dropin-1day" },
};
const message = {
  topic: "request-pass", locationId: "santa-ynez-valley", passType: "combat-dropin-1day",
  passPaymentStatus: "pending", passAmountCents: 2500, passCurrency: "usd",
  passPriceLookupKey: "sandman_academy-2026-v3_combat_dropin_1day",
  stripePriceId: "price_pass_1", stripeCheckoutSessionId: "cs_pass_1",
  passPayerEmail: "payer@example.com", paymentCreatedAt: { seconds: 1 },
  paymentCreatedBy: "manager-1",
};

function harness(changes = {}) {
  const calls = { loaded: 0, retrieved: 0, updated: 0 };
  const deps = {
    loadMessage: async () => { calls.loaded++; return changes.message === null ? null : { ...message, ...changes.message }; },
    retrievePaymentIntent: async () => {
      calls.retrieved++;
      return { id: "pi_pass_1", status: "succeeded", amountReceived: 2500,
        currency: "usd", receiptUrl: "https://pay.stripe.com/receipts/example", ...changes.payment };
    },
    markPaid: async () => { calls.updated++; },
  };
  return { calls, deps };
}

test("verified paid Management pass updates the linked message once", async () => {
  const { calls, deps } = harness();
  const result = await processManagementPassCheckoutCompleted(session, deps);
  assert.deepEqual(result, { paid: true, duplicate: false, messageId: "message-1" });
  assert.deepEqual(calls, { loaded: 1, retrieved: 1, updated: 1 });
});

test("wrong message or Checkout Session identity fails without a write", async () => {
  for (const changedSession of [
    { metadata: { ...session.metadata, messageId: "other-message" } },
    { id: "cs_other" },
    { client_reference_id: "other-message" },
  ]) {
    const { calls, deps } = harness();
    await assert.rejects(processManagementPassCheckoutCompleted({ ...session, ...changedSession }, deps), /identity|not found/i);
    assert.equal(calls.updated, 0);
    assert.equal(calls.retrieved, 0);
  }
});

test("wrong location metadata and unsupported stored pass type fail without mutation", async () => {
  const wrongLocation = harness();
  await assert.rejects(processManagementPassCheckoutCompleted({ ...session,
    metadata: { ...session.metadata, locationId: "lompoc" } }, wrongLocation.deps), /identity/i);
  assert.equal(wrongLocation.calls.updated, 0);
  const unsupported = harness({ message: { passType: "unsupported" } });
  await assert.rejects(processManagementPassCheckoutCompleted(session, unsupported.deps), /supported pass/i);
  assert.equal(unsupported.calls.updated, 0);
});

test("unpaid or incomplete Checkout never reads or mutates a message", async () => {
  for (const change of [{ payment_status: "unpaid" }, { status: "open" }]) {
    const { calls, deps } = harness();
    const result = await processManagementPassCheckoutCompleted({ ...session, ...change }, deps);
    assert.equal(result.paid, false);
    assert.deepEqual(calls, { loaded: 0, retrieved: 0, updated: 0 });
  }
});

test("duplicate delivery for an already paid matching PaymentIntent is a no-op", async () => {
  const { calls, deps } = harness({ message: {
    passPaymentStatus: "paid", stripePaymentIntentId: "pi_pass_1",
  } });
  const result = await processManagementPassCheckoutCompleted(session, deps);
  assert.deepEqual(result, { paid: true, duplicate: true, messageId: "message-1" });
  assert.equal(calls.updated, 0);
  assert.equal(calls.retrieved, 0);
});

test("missing message, incomplete linkage, amount mismatch, or unpaid PaymentIntent fail closed", async () => {
  for (const changes of [
    { message: null },
    { message: { stripePriceId: "" } },
    { message: { passAmountCents: 4000 } },
    { payment: { status: "processing" } },
  ]) {
    const { calls, deps } = harness(changes);
    await assert.rejects(processManagementPassCheckoutCompleted(session, deps));
    assert.equal(calls.updated, 0);
  }
});

test("existing proposal and family Checkout routing remains after isolated pass branch", () => {
  const source = readFileSync(new URL("../../functions/src/billing/webhook.ts", import.meta.url), "utf8");
  assert.match(source, /session\.metadata\?\.paymentFlow\) === "management_pass"/);
  assert.match(source, /await handleManagementPassCheckoutCompleted\(session\)/);
  assert.match(source, /if \(proposalId\) \{\s*await handleProposalCheckoutCompleted\(\s*session\s*\)/);
  assert.match(source, /familyId =\s*await handleCheckoutCompleted\(\s*session\s*\)/);
});
