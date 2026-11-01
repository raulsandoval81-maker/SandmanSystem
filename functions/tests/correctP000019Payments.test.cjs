const test = require("node:test");
const assert = require("node:assert/strict");
const { correctP000019Payments } = require("../lib/billing/correctP000019Payments.js");
const { summarizeHistoricalCash } = require("../lib/billing/historicalCashReconciliation.js");

const original = () => ({
  proposalId: "P-000019",
  locationId: "santa-ynez-valley",
  status: "DRAFT",
  pricing: { enrollmentBase: 30, monthlyBalance: 80 },
  priorPayments: [
    {
      amountCents: 10000,
      paymentMethod: "cash",
      enrollmentFeeIncluded: false,
      periods: ["2026-09"],
      note: "September month-to-month membership",
      recordedBy: "staff",
    },
    {
      amountCents: 10000,
      paymentMethod: "cash",
      enrollmentFeeIncluded: false,
      periods: ["2026-10"],
      note: "October payment",
      recordedBy: "staff",
      paymentId: "oct-history",
    },
  ],
});

test("P-000019 September $100 month-to-month and October $80/$20 reconcile to $10 owed", () => {
  const before = original();
  const result = correctP000019Payments(before);
  assert.equal(result.totalReceivedCents, 20000);
  assert.equal(result.enrollmentRemainingCents, 1000);
  assert.deepEqual(before.priorPayments, original().priorPayments, "original receipts cannot be mutated");
  assert.equal(result.corrected[0].membershipAmountCents, 10000);
  assert.equal(result.corrected[0].historicalMonthlyRateCents, 10000);
  assert.equal(result.corrected[1].membershipAmountCents, 8000);
  assert.equal(result.corrected[1].enrollmentFeeAmountCents, 2000);
  assert.equal(result.corrected[1].paymentId, "oct-history", "preserve receipt identity");
  const review = summarizeHistoricalCash({
    priorPayments: result.corrected,
    monthlyMembershipCents: 8000,
    enrollmentFeeCents: 3000,
  });
  assert.deepEqual(review.issues, []);
  assert.deepEqual(review.fullyPaidPeriods, ["2026-09", "2026-10"]);
  assert.equal(review.enrollmentPaidCents, 2000);
  assert.equal(review.enrollmentRemainingCents, 1000);
  assert.equal(review.unappliedMembershipCents, 0);
  assert.equal(review.totalRecordedCents, 20000);
});

test("never correct after issuing review or outside unsigned draft", () => {
  for (const mutation of [
    { status: "PAID" }, { clientReview: { tokenHash: "issued" } },
    { historicalPaymentCorrection: { historyId: "already-corrected" } },
    { historicalCashDisposition: { status: "recorded" } },
  ]) {
    assert.throws(() => correctP000019Payments({ ...original(), ...mutation }),
      /eligible, uncorrected draft/);
  }
});

test("reject changed receipt amounts, missing receipts, changed location, or already allocated fee", () => {
  const changes = [
    { priorPayments: original().priorPayments.slice(0, 1) },
    { priorPayments: [original().priorPayments[0], { ...original().priorPayments[1], amountCents: 9000 }] },
    { priorPayments: [original().priorPayments[0], { ...original().priorPayments[1], enrollmentFeeAmountCents: 2000 }] },
    { locationId: "other" },
    { proposalId: "P-000020" },
  ];
  for (const mutation of changes) {
    assert.throws(() => correctP000019Payments({ ...original(), ...mutation }));
  }
});

test("mixed-rate reconciliation rejects overpayments and conflicting monthly charges", () => {
  const corrected = correctP000019Payments(original()).corrected;
  const overpaid = corrected.map(p => ({ ...p }));
  overpaid[0].membershipPeriodAllocations = [{ ...overpaid[0].membershipPeriodAllocations[0], paidCents: 11000 }];
  const result = summarizeHistoricalCash({
    priorPayments: overpaid,
    monthlyMembershipCents: 8000,
    enrollmentFeeCents: 3000,
  });
  assert.ok(result.issues.length > 0);
});
