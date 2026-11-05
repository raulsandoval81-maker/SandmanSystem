// Emulator-only tests. No provider credentials, real parents, or Stripe.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.GCLOUD_PROJECT?.startsWith("demo-")) {
  throw new Error("2C receipt tests require an isolated demo-* Firestore emulator.");
}
if (process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY) {
  throw new Error("2C receipt tests refuse Stripe or email provider credentials.");
}

const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore(app);
const emailModule = require("../lib/modules/email/resend");
const originalClient = emailModule.getResendClient;
const sendReceipt = require("../lib/billing/sendProposalPrepaidCashReceipt").sendProposalPrepaidCashReceipt;
const suffix = process.pid.toString().padStart(6, "0").slice(-6);
const id = "P-" + suffix;
const manager = "2c-manager-" + suffix;
const outsider = "2c-outsider-" + suffix;
const recipient = "synthetic-receipt@example.invalid";
const call = (uid, proposalId = id, extra = {}) =>
  sendReceipt.run({auth: {uid, token: {}}, data: {proposalId, ...extra}});
const receiptRef = db.doc("proposals/" + id + "/delivery/cash_check_receipt");
const proposalRef = db.doc("proposals/" + id);
let emails = [];

function paidProposal(overrides = {}) {
  return {
    proposalId: id, locationId: "2c-location-" + suffix,
    status: "PAID", paymentStatus: "paid", paymentMethod: "cash_prepaid",
    paidAt: Timestamp.now(),
    lockedSnapshot: {prospect: {parentEmail: recipient}},
    cashPrepayment: {
      amountCents: 99000, membershipAmountCents: 96000,
      annualEnrollmentFee: {outstandingCents: 0},
      paymentMethod: "check",
      paymentDate: Timestamp.fromDate(new Date("2026-11-01T12:00:00Z")),
      membershipStartDate: Timestamp.fromDate(new Date("2026-11-01T12:00:00Z")),
      membershipPaidThroughDate: Timestamp.fromDate(new Date("2027-10-31T12:00:00Z")),
      nextBillingDate: Timestamp.fromDate(new Date("2027-11-01T12:00:00Z")),
    },
    ...overrides,
  };
}

test.before(async () => {
  emailModule.getResendClient = () => ({
    emails: { send: async (payload) => {
      emails.push(payload);
      return {data: {id: "synthetic-email-" + emails.length}, error: null};
    }},
  });
  await db.doc("staff/" + manager).set({
    role: "management", status: "active", locationIds: ["2c-location-" + suffix]
  });
  await db.doc("staff/" + outsider).set({
    role: "management", status: "active", locationIds: ["other-location"]
  });
  await proposalRef.set(paidProposal());
});
test.after(async () => {
  emailModule.getResendClient = originalClient;
  await deleteApp(app);
});

test("2C receipt rejects staff from a different location", async () => {
  await assert.rejects(call(outsider), /location|permission/i);
  assert.equal(emails.length, 0);
});

test("2C receipt rejects an unverified cash/check payment", async () => {
  const unpaid = "P-UNPAID-" + suffix;
  await db.doc("proposals/" + unpaid).set(paidProposal({proposalId: unpaid, status: "READY_FOR_CHECKOUT"}));
  await assert.rejects(call(manager, unpaid), /verified cash\/check/i);
  assert.equal(emails.length, 0);
});

test("2C sends a verified receipt exactly once and records an audit entry", async () => {
  const first = await call(manager);
  assert.equal(first.ok, true);
  assert.equal(first.alreadySent, false);
  assert.equal(first.recipient, recipient);
  assert.equal(emails.length, 1);
  assert.match(emails[0].text, /\$990\.00/);
  assert.match(emails[0].text, /\$960\.00/);
  assert.match(emails[0].text, /2027-10-31/);
  const recorded = (await receiptRef.get()).data();
  assert.equal(recorded.status, "SENT");
  assert.equal(recorded.providerId, "synthetic-email-1");
  const history = await proposalRef.collection("history").doc("cash_check_receipt_sent").get();
  assert.equal(history.data().event, "CASH_PREPAYMENT_RECEIPT_SENT");
  const second = await call(manager);
  assert.equal(second.alreadySent, true);
  assert.equal(emails.length, 1);
  const proposal = (await proposalRef.get()).data();
  assert.equal(proposal.paymentMethod, "cash_prepaid");
  assert.equal(proposal.stripeCheckoutSessionId, undefined);
  assert.equal(proposal.stripeSubscriptionId, undefined);
});

test("2C fail-closes uncertain email outcomes and prevents duplicate sends", async () => {
  const uncertain = "P-UNSURE-" + suffix;
  await db.doc("proposals/" + uncertain).set(paidProposal({proposalId: uncertain}));
  let attempts = 0;
  emailModule.getResendClient = () => ({
    emails: {send: async () => {attempts++; throw Error("synthetic unknown provider outcome");}}
  });
  await assert.rejects(call(manager, uncertain), /uncertain/i);
  await assert.rejects(call(manager, uncertain), /pending/i);
  assert.equal(attempts, 1);
  const saved = (await db.doc("proposals/" + uncertain + "/delivery/cash_check_receipt").get()).data();
  assert.equal(saved.status, "SENDING");
});
