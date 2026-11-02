const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertPrepaidFamilyConfirmation,
  assertPrepaidReconciliationCanBePrepared,
  hasConflictingStripeActivity,
  hasRecordedMembershipPayment,
  isPreparedForPrepaidReconciliation,
} = require("../lib/billing/prepaidReconciliationPolicy.js");

const snapshot = {
  athletes: [{ name: "Synthetic Athlete", plan: "standard", billingTerm: "annual" }],
  pricing: { monthlyBalance: 80, enrollmentBase: 30, membershipStartDate: "2026-10-05" },
};
const proposal = () => ({
  status: "READY_FOR_CHECKOUT",
  lockedSnapshot: snapshot,
  clientAcceptance: { signedAt: { toMillis: () => 1 }, signedSnapshot: snapshot },
});

test("accepted locked 12-month proposal can enter Management prepaid reconciliation", () => {
  assert.doesNotThrow(() => assertPrepaidReconciliationCanBePrepared(proposal()));
});

test("prepaid preparation rejects missing acceptance, nonannual terms, and Stripe activity", () => {
  assert.throws(() => assertPrepaidReconciliationCanBePrepared({
    ...proposal(), clientAcceptance: undefined,
  }), /family must accept/i);
  const monthlySnapshot = {
    ...snapshot, athletes: [{ plan: "standard", billingTerm: "month-to-month" }],
  };
  assert.throws(() => assertPrepaidReconciliationCanBePrepared({
    ...proposal(), lockedSnapshot: monthlySnapshot,
    clientAcceptance: { signedAt: { toMillis: () => 1 }, signedSnapshot: monthlySnapshot },
  }), /12-month/);
  assert.equal(hasConflictingStripeActivity({ pendingCheckoutSessionId: "cs_test_1" }), true);
  assert.throws(() => assertPrepaidReconciliationCanBePrepared({
    ...proposal(), stripeSubscriptionId: "sub_1",
  }), /Stripe activity/);
});

test("existing membership evidence blocks duplicate prepaid recording and Elias stays on historical cash", () => {
  const historical = {
    priorPayments: [{
      paymentId: "september",
      membershipAmountCents: 10000,
      periods: ["2026-09"],
    }],
  };
  assert.equal(hasRecordedMembershipPayment(historical), true);
  assert.throws(() => assertPrepaidReconciliationCanBePrepared({
    ...proposal(), ...historical,
  }), /already recorded/);
});

test("only server-recorded route and timestamped confirmation authorize recording", () => {
  const prepared = {
    ...proposal(),
    prepaidReconciliation: { status: "AWAITING_FAMILY_CONFIRMATION" },
  };
  assert.equal(isPreparedForPrepaidReconciliation(prepared), true);
  assert.throws(() => assertPrepaidFamilyConfirmation(prepared), /Review & Confirm/);
  assert.throws(() => assertPrepaidFamilyConfirmation({
    ...prepared,
    enrollmentConfirmation: { termsConfirmed: true, confirmedAt: "browser-value" },
  }), /Review & Confirm/);
  assert.doesNotThrow(() => assertPrepaidFamilyConfirmation({
    ...prepared,
    enrollmentConfirmation: { termsConfirmed: true, confirmedAt: { toMillis: () => 10 } },
  }));
});
