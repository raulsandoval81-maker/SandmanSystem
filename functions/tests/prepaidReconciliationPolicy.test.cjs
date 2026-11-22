const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertHistoricalPrepaidReconciliation,
  assertCashCheckFamilyReviewTerms,
  assertPrepaidFamilyConfirmation,
  assertPrepaidReconciliationCanBePrepared,
  hasConflictingStripeActivity,
  hasRecordedMembershipPayment,
  isPreparedForPrepaidReconciliation,
} = require("../lib/billing/prepaidReconciliationPolicy.js");

const snapshot = {
  athletes: [{ name: "Synthetic Athlete", plan: "standard", billingTerm: "annual" }],
  pricing: {
    paymentArrangement: "prepaid_cash_check",
    monthlyBalance: 80, enrollmentBase: 30, membershipStartDate: "2026-10-05",
    prepaidTerms: {
      monthsCovered: 12, membershipAmountCents: 96000,
      membershipStartDate: "2026-10-05", paidThroughDate: "2027-10-04",
      nextBillingDate: "2027-10-05", automaticRenewal: false,
      annualEnrollmentFee: { outstandingCents: 3000 },
    },
  },
};
const proposal = () => ({
  status: "READY_FOR_CHECKOUT",
  lockedSnapshot: snapshot,
  clientAcceptance: { signedAt: { toMillis: () => 1 }, signedSnapshot: snapshot },
});

test("accepted locked 12-month proposal can enter Management prepaid reconciliation", () => {
  assert.doesNotThrow(() => assertPrepaidReconciliationCanBePrepared(proposal()));
});

test("family Cash/Check view refuses a prepared monthly agreement or missing prepaid terms", () => {
  const valid = {
    ...proposal(),
    lockedSnapshot: {
      ...snapshot,
      pricing: {
        ...snapshot.pricing,
        prepaidTerms: {
          monthsCovered: 12,
          membershipAmountCents: 96000,
          annualEnrollmentFee: { outstandingCents: 3000 },
          membershipStartDate: "2026-11-01",
          paidThroughDate: "2027-10-31",
          nextBillingDate: "2027-11-01",
          automaticRenewal: false,
        },
      },
    },
  };
  assert.doesNotThrow(() => assertCashCheckFamilyReviewTerms(valid));
  const invalidMonthly = {
    ...valid,
    lockedSnapshot: {
      ...valid.lockedSnapshot,
      pricing: { ...valid.lockedSnapshot.pricing, paymentArrangement: "monthly_autopay" },
    },
  };
  assert.throws(() => assertCashCheckFamilyReviewTerms(invalidMonthly), /Cash.Check Paid-in-Full terms/);
  const absentTerms = {
    ...valid,
    lockedSnapshot: {
      ...valid.lockedSnapshot,
      pricing: { ...valid.lockedSnapshot.pricing, prepaidTerms: undefined },
    },
  };
  assert.throws(() => assertCashCheckFamilyReviewTerms(absentTerms), /missing or inconsistent/);
  const changedMembership = {
    ...valid,
    lockedSnapshot: {
      ...valid.lockedSnapshot,
      pricing: {
        ...valid.lockedSnapshot.pricing,
        prepaidTerms: { ...valid.lockedSnapshot.pricing.prepaidTerms, membershipAmountCents: 8000 },
      },
    },
  };
  assert.throws(() => assertCashCheckFamilyReviewTerms(changedMembership), /missing or inconsistent/);
});

test("a 12-month monthly or Stripe proposal cannot enter Cash/Check prepaid review", () => {
  for (const paymentArrangement of ["monthly_autopay", "prepaid_stripe"]) {
    const wrongSnapshot = {
      ...snapshot,
      pricing: { ...snapshot.pricing, paymentArrangement },
    };
    assert.throws(() => assertPrepaidReconciliationCanBePrepared({
      ...proposal(),
      lockedSnapshot: wrongSnapshot,
      clientAcceptance: { signedAt: { toMillis: () => 1 }, signedSnapshot: wrongSnapshot },
    }), /Cash.Check Paid-in-Full/);
  }
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

const historicalProposal = () => {
  const cashSnapshot = {
    ...snapshot,
    pricing: { ...snapshot.pricing, paymentArrangement: "prepaid_cash_check" },
  };
  return {
    ...proposal(),
    createdAt: { toMillis: () => Date.parse("2026-11-21T02:00:00Z") },
    lockedSnapshot: cashSnapshot,
    clientAcceptance: {
      consentAccepted: true,
      signedAt: { toMillis: () => Date.parse("2026-11-21T03:00:00Z") },
      signedSnapshot: cashSnapshot,
    },
  };
};

test("historical Cash/Check uses the existing accepted agreement without Review & Confirm", () => {
  const existing = historicalProposal();
  assert.doesNotThrow(() => assertHistoricalPrepaidReconciliation(existing, "2026-10-30"));
  assert.throws(() => assertPrepaidFamilyConfirmation(existing), /must prepare/);
});

test("historical reconciliation rejects missing consent or a changed agreement", () => {
  const existing = historicalProposal();
  for (const clientAcceptance of [
    undefined,
    { ...existing.clientAcceptance, consentAccepted: false },
    { ...existing.clientAcceptance, signedAt: "browser-value" },
    { ...existing.clientAcceptance, signedSnapshot: {
      ...snapshot,
      pricing: { ...snapshot.pricing, paymentArrangement: "monthly_autopay" },
    } },
  ]) {
    assert.throws(() => assertHistoricalPrepaidReconciliation({
      ...existing, clientAcceptance,
    }, "2026-10-30"), /accept|matches/);
  }
});

test("historical reconciliation rejects ordinary payments, Stripe activity and duplicate membership credits", () => {
  const existing = historicalProposal();
  assert.throws(() => assertHistoricalPrepaidReconciliation(existing, "2026-11-20"), /predate/);
  assert.throws(() => assertHistoricalPrepaidReconciliation(existing, "2026-11-22"), /predate/);
  assert.throws(() => assertHistoricalPrepaidReconciliation({
    ...existing, createdAt: undefined,
  }, "2026-10-30"), /creation date/);
  assert.throws(() => assertHistoricalPrepaidReconciliation({
    ...existing, stripeCheckoutSessionId: "cs_test_1",
  }, "2026-10-30"), /Stripe activity/);
  assert.throws(() => assertHistoricalPrepaidReconciliation({
    ...existing, cashPrepayment: { amountCents: 96000 },
  }, "2026-10-30"), /already recorded/);
  const ordinary = {
    ...snapshot,
    pricing: { ...snapshot.pricing, paymentArrangement: "monthly_autopay" },
  };
  assert.throws(() => assertHistoricalPrepaidReconciliation({
    ...proposal(), createdAt: existing.createdAt,
    lockedSnapshot: ordinary,
    clientAcceptance: {
      signedAt: { toMillis: () => Date.parse("2026-11-21T03:00:00Z") },
      signedSnapshot: ordinary,
      consentAccepted: true,
    },
  }, "2026-10-30"), /Cash.Check Paid-in-Full/);
});
