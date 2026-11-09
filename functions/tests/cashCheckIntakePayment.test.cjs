const assert = require("node:assert/strict");
const { test } = require("node:test");
const { requireVerifiedCashCheckIntakePayment } = require("../lib/enrollment/requireVerifiedCashCheckIntakePayment");

const intake = { proposalId: "P-000003", locationId: "santa-ynez-valley" };
const proposal = {
  locationId: intake.locationId,
  lockedSnapshot: { pricing: { paymentArrangement: "prepaid_cash_check" } },
  status: "PAID", paymentStatus: "paid", paymentMethod: "cash_prepaid", paidAt: {},
  cashPrepayment: {
    paymentMethod: "cash", amountCents: 96000, membershipAmountCents: 96000,
    membershipPaidInFull: true, paymentDate: "2026-11-09", membershipStartDate: "2026-11-09",
    membershipPaidThroughDate: "2027-11-08", nextBillingDate: "2027-11-09",
    receivedAt: {}, receivedBy: "management",
    annualEnrollmentFee: { paidWithPrepaymentCents: 0, outstandingCents: 3000 },
  },
};

function verify(data, input = intake) {
  const db = { collection: (name) => ({ doc: (id) => `${name}/${id}` }) };
  const tx = { get: async (ref) => {
    assert.equal(ref, "proposals/P-000003");
    return { exists: Boolean(data), data: () => data };
  } };
  return requireVerifiedCashCheckIntakePayment(db, tx, input);
}

test("verified Cash/Check membership admits minting with separate annual fee outstanding", async () => {
  assert.equal(await verify(proposal), true);
  assert.equal(proposal.cashPrepayment.annualEnrollmentFee.outstandingCents, 3000);
});

test("unpaid, missing, inconsistent, or Stripe-linked Cash/Check fails closed", async () => {
  for (const data of [
    null,
    { ...proposal, status: "READY_FOR_CHECKOUT", cashPrepayment: undefined },
    { ...proposal, stripeCheckoutSessionId: "cs_test_unrelated" },
    { ...proposal, locationId: "different-location" },
    { ...proposal, cashPrepayment: { ...proposal.cashPrepayment, membershipPaidInFull: false } },
    { ...proposal, cashPrepayment: { ...proposal.cashPrepayment, amountCents: 95999 } },
  ]) {
    await assert.rejects(verify(data), { code: "failed-precondition" });
  }
});

test("Stripe and non-proposal intake continue through their existing paths", async () => {
  assert.equal(await verify({ lockedSnapshot: { pricing: { paymentArrangement: "prepaid_stripe" } } }), false);
  assert.equal(await verify(null, {}), false);
});
