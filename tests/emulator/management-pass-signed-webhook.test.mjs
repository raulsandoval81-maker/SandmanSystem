import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { createRequire } from "node:module";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Firestore emulator required.");
process.env.STRIPE_WEBHOOK_SECRET = "whsec_management_pass_emulator_only";
const require = createRequire(import.meta.url);
const admin = require("../../functions/node_modules/firebase-admin");
const Stripe = require("../../functions/node_modules/stripe");
const stripe = new Stripe("sk_test_emulator_only");
const projectId = process.env.GCLOUD_PROJECT || "demo-sandman-payments-v1";
admin.initializeApp({ projectId });
const db = admin.firestore();
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const stripeClient = require(`${buildRoot}/billing/stripeClient.js`);
stripeClient.getStripe = () => ({
  webhooks: stripe.webhooks,
  paymentIntents: { retrieve: async (id) => ({
    id, status: "succeeded", amount_received: 2500, currency: "usd",
    latest_charge: { receipt_url: "https://pay.stripe.com/receipts/emulator" },
  }) },
});
const { stripeBillingWebhook } = require(`${buildRoot}/billing/webhook.js`);

before(async () => {
  await db.doc("general_messages/valid-pass").set({
    topic: "request-pass", passType: "combat-dropin-1day", locationId: "santa-ynez-valley",
    passAttendanceConfirmedAt: admin.firestore.Timestamp.now(), passAttendanceConfirmedBy: "manager",
    passPaymentStatus: "pending", passAmountCents: 2500, passCurrency: "usd",
    passPriceLookupKey: "sandman_academy-2026-v3_combat_dropin_1day",
    passPayerEmail: "payer@example.com", paymentCreatedAt: admin.firestore.Timestamp.now(),
    paymentCreatedBy: "manager", stripePriceId: "price_test", stripeCheckoutSessionId: "cs_valid",
  });
  await db.doc("general_messages/invalid-pass").set({
    topic: "request-pass", passType: "combat-dropin-1day", locationId: "santa-ynez-valley",
    passAttendanceConfirmedAt: admin.firestore.Timestamp.now(), passAttendanceConfirmedBy: "manager",
    passPaymentStatus: "pending", passAmountCents: 2500, passCurrency: "usd",
    passPriceLookupKey: "sandman_academy-2026-v3_combat_dropin_1day",
    passPayerEmail: "payer@example.com", paymentCreatedAt: admin.firestore.Timestamp.now(),
    paymentCreatedBy: "manager", stripePriceId: "price_test", stripeCheckoutSessionId: "cs_different",
  });
});
after(async () => admin.app().delete());

function session(messageId, sessionId) {
  return { id: sessionId, object: "checkout.session", status: "complete", payment_status: "paid",
    mode: "payment", currency: "usd", amount_total: 2500, client_reference_id: messageId,
    payment_intent: `pi_${messageId}`, customer: "cus_emulator",
    metadata: { paymentFlow: "management_pass", messageId, locationId: "santa-ynez-valley",
      passType: "combat-dropin-1day" } };
}

async function deliver(eventId, checkoutSession, validSignature = true) {
  const payload = JSON.stringify({ id: eventId, object: "event", type: "checkout.session.completed",
    livemode: false, api_version: "2024-06-20", data: { object: checkoutSession } });
  const signature = validSignature
    ? stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET })
    : "invalid-signature";
  const response = { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; } };
  await stripeBillingWebhook({ method: "POST", rawBody: Buffer.from(payload),
    headers: { "stripe-signature": signature } }, response);
  return response;
}

test("signed paid Management pass event updates exactly the linked message", async () => {
  const response = await deliver("evt_management_pass_valid", session("valid-pass", "cs_valid"));
  assert.equal(response.statusCode, 200);
  const saved = (await db.doc("general_messages/valid-pass").get()).data();
  assert.equal(saved.passPaymentStatus, "paid");
  assert.equal(saved.stripePaymentIntentId, "pi_valid-pass");
  assert.equal(saved.stripeReceiptUrl, "https://pay.stripe.com/receipts/emulator");
  assert.equal(saved.stripeCheckoutSessionId, "cs_valid");
  assert.equal((await db.doc("general_messages/invalid-pass").get()).get("passPaymentStatus"), "pending");
  assert.equal((await db.doc("billingEvents/evt_management_pass_valid").get()).get("processed"), true);
});

test("signed event with invalid stored Session linkage does not mutate", async () => {
  const response = await deliver("evt_management_pass_invalid", session("invalid-pass", "cs_wrong"));
  assert.notEqual(response.statusCode, 200);
  assert.equal((await db.doc("general_messages/invalid-pass").get()).get("passPaymentStatus"), "pending");
});

test("invalid Stripe signature cannot mutate the message", async () => {
  const response = await deliver("evt_management_pass_unsigned", session("invalid-pass", "cs_different"), false);
  assert.equal(response.statusCode, 400);
  assert.equal((await db.doc("general_messages/invalid-pass").get()).get("passPaymentStatus"), "pending");
});
