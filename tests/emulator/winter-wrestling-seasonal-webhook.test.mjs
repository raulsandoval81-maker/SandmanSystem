import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("../../functions/node_modules/firebase-admin");

process.env.GCLOUD_PROJECT ||= "demo-sandman-seasonal";
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });

const db = admin.firestore();
const {
  handleSeasonalProposalPaymentFailed,
  handleSeasonalProposalPaymentSucceeded,
} = require("../../functions/lib/billing/seasonalProposalWebhook.js");
const {
  createSeasonalProposalCheckout,
} = require("../../functions/lib/billing/seasonalProposalCheckout.js");

function session(overrides = {}) {
  return {
    id: "cs_test_seasonal_1",
    object: "checkout.session",
    livemode: false,
    payment_status: "paid",
    payment_intent: "pi_test_seasonal_1",
    metadata: {
      proposalId: "P-SEASONAL-TEST",
      source: "winter_wrestling_seasonal",
      installmentNumber: "1",
      installmentAmountCents: "20000",
    },
    ...overrides,
  };
}

async function seed() {
  const history = await db.collection("proposals/P-SEASONAL-TEST/history").get();
  await Promise.all(history.docs.map((doc) => doc.ref.delete()));
  await db.doc("proposals/P-SEASONAL-TEST").set({
    status: "CHECKOUT_CREATED",
    pendingCheckoutSessionId: "cs_test_seasonal_1",
    seasonalPaymentLedger: [
      { number: 1, amountCents: 20000, dueDate: "2026-11-15", status: "pending", checkoutSessionId: "cs_test_seasonal_1" },
      { number: 2, amountCents: 15000, dueDate: "2026-12-15", status: "scheduled" },
    ],
  });
}

test("paid webhook is idempotent and advances the locked ledger once", async () => {
  await seed();
  await handleSeasonalProposalPaymentSucceeded(session());
  await handleSeasonalProposalPaymentSucceeded(session());
  const snap = await db.doc("proposals/P-SEASONAL-TEST").get();
  assert.equal(snap.get("status"), "PARTIALLY_PAID");
  assert.equal(snap.get("seasonalPaymentLedger")[0].status, "paid");
  assert.equal(snap.get("seasonalPaymentLedger")[0].paymentIntentId, "pi_test_seasonal_1");
  const history = await db.collection("proposals/P-SEASONAL-TEST/history").get();
  assert.equal(history.size, 1);
});

test("failed payment is visible and cannot erase a paid installment", async () => {
  await seed();
  await handleSeasonalProposalPaymentFailed(
    session({ payment_status: "unpaid" }),
    "checkout.session.async_payment_failed",
  );
  let snap = await db.doc("proposals/P-SEASONAL-TEST").get();
  assert.equal(snap.get("status"), "PAYMENT_FAILED");
  assert.equal(snap.get("seasonalPaymentLedger")[0].status, "failed");

  await seed();
  await handleSeasonalProposalPaymentSucceeded(session());
  await handleSeasonalProposalPaymentFailed(session(), "late duplicate failure");
  snap = await db.doc("proposals/P-SEASONAL-TEST").get();
  assert.equal(snap.get("seasonalPaymentLedger")[0].status, "paid");
});

test("Checkout is one-time, resumable, and never authorizes future automatic payments", async () => {
  const proposalId = "P-SEASONAL-CHECKOUT";
  const pricing = {
    billingType: "seasonal_one_time",
    campaignId: "winter-wrestling-2026-27",
    automaticFuturePayments: false,
    athleteCount: 1,
    totalCents: 35000,
    trainingSchedule: "monday-wednesday-saturday",
    installments: [
      { number: 1, amountCents: 20000, dueDate: "2026-11-15", status: "scheduled" },
      { number: 2, amountCents: 15000, dueDate: "2026-12-15", status: "scheduled" },
    ],
  };
  const proposal = {
    status: "READY_FOR_CHECKOUT",
    lockedSnapshot: { pricing, prospect: { email: "synthetic@example.test" } },
  };
  await db.doc(`proposals/${proposalId}`).set(proposal);
  let createParams;
  const openSession = {
    id: "cs_test_seasonal_checkout",
    status: "open",
    payment_status: "unpaid",
    url: "https://checkout.stripe.test/seasonal",
    metadata: { source: "winter_wrestling_seasonal", installmentNumber: "1" },
  };
  const stripe = {
    checkout: { sessions: {
      create: async (params) => { createParams = params; return openSession; },
      retrieve: async () => openSession,
      expire: async () => ({ ...openSession, status: "expired" }),
    } },
  };
  const created = await createSeasonalProposalCheckout({
    stripe,
    db,
    proposalId,
    proposal,
    actorUid: "synthetic-parent",
    publicBaseUrl: "http://127.0.0.1:5002",
  });
  assert.equal(created.checkoutSessionId, openSession.id);
  assert.equal(createParams.mode, "payment");
  assert.equal(createParams.payment_intent_data.setup_future_usage, undefined);
  assert.equal(createParams.payment_method_types, undefined);

  const refreshed = (await db.doc(`proposals/${proposalId}`).get()).data();
  const resumed = await createSeasonalProposalCheckout({
    stripe,
    db,
    proposalId,
    proposal: refreshed,
    actorUid: "synthetic-parent",
    publicBaseUrl: "http://127.0.0.1:5002",
  });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.checkoutSessionId, openSession.id);
});

test("a failed installment receives a new idempotency scope without duplicating paid work", async () => {
  const proposalId = "P-SEASONAL-RETRY";
  const proposal = {
    status: "PAYMENT_FAILED",
    lockedSnapshot: {
      prospect: { email: "synthetic@example.test" },
      pricing: {
        billingType: "seasonal_one_time",
        campaignId: "winter-wrestling-2026-27",
        automaticFuturePayments: false,
        athleteCount: 1,
        totalCents: 35000,
        trainingSchedule: "monday-wednesday-saturday",
        installments: [
          { number: 1, amountCents: 20000, dueDate: "2026-11-15" },
          { number: 2, amountCents: 15000, dueDate: "2026-12-15" },
        ],
      },
    },
    seasonalPaymentLedger: [
      { number: 1, amountCents: 20000, dueDate: "2026-11-15", status: "failed", checkoutSessionId: "cs_failed_old" },
      { number: 2, amountCents: 15000, dueDate: "2026-12-15", status: "scheduled" },
    ],
  };
  await db.doc(`proposals/${proposalId}`).set(proposal);
  let requestOptions;
  const stripe = {
    checkout: { sessions: {
      create: async (_params, options) => {
        requestOptions = options;
        return { id: "cs_retry_new", status: "open", payment_status: "unpaid", url: "https://checkout.stripe.test/retry" };
      },
      retrieve: async () => { throw new Error("no pending session should be retrieved"); },
      expire: async () => null,
    } },
  };
  const result = await createSeasonalProposalCheckout({
    stripe,
    db,
    proposalId,
    proposal,
    actorUid: "synthetic-parent",
    publicBaseUrl: "http://127.0.0.1:5002",
  });
  assert.equal(result.checkoutSessionId, "cs_retry_new");
  assert.match(requestOptions.idempotencyKey, /cs_failed_old$/);
});
