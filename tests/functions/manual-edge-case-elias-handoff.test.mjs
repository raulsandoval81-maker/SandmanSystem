import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const { buildManualProposalAdjustment } =
  require(`${buildRoot}/management/manualEdgeCaseProposalPolicy.js`);
const { buildClientProposalSnapshot } =
  require(`${buildRoot}/proposals/proposalClientReview.js`);
const { resolveHistoricalCashCheckoutTerms } =
  require(`${buildRoot}/billing/historicalCashCheckoutTerms.js`);

const receipt = (paymentId, period) => ({
  paymentId,
  amountCents: 10000,
  paymentMethod: "cash",
  membershipAmountCents: 10000,
  enrollmentFeeAmountCents: 0,
  unappliedMembershipAmountCents: 0,
  requestedPeriods: [period],
  periods: [period],
  membershipPeriodAllocations: [{
    period,
    paidCents: 10000,
    previouslyPaidCents: 0,
    totalPaidCents: 10000,
    requiredCents: 10000,
    fullyPaid: true,
  }],
  historicalMonthlyRateCents: 10000,
});

const eliasProposal = () => ({
  proposalId: "P-000019",
  locationId: "santa-ynez-valley",
  status: "DRAFT",
  pricing: {
    monthlyBalance: 80,
    enrollmentBase: 30,
    membershipStartDate: "2026-09-01",
    firstRecurringChargeDate: "2026-11-05",
    recurringBillingDay: 5,
  },
  priorPayments: [
    receipt("synthetic-september-cash", "2026-09"),
    receipt("synthetic-october-cash", "2026-10"),
  ],
});

test("synthetic P-000019 correction preserves $200 and hands off $10 enrollment plus November 5 recurring", () => {
  const original = eliasProposal();
  const correction = buildManualProposalAdjustment(original, [{
    paymentId: "synthetic-october-cash",
    enrollmentFeeAmountCents: 2000,
    historicalMonthlyRateCents: 8000,
  }]);

  assert.equal(correction.originalTotalCents, 20000);
  assert.equal(correction.afterSummary.totalRecordedCents, 20000);
  assert.equal(correction.afterSummary.enrollmentPaidCents, 2000);
  assert.equal(correction.afterSummary.enrollmentRemainingCents, 1000);
  assert.equal(correction.afterSummary.unappliedMembershipCents, 0);
  assert.deepEqual(correction.afterSummary.fullyPaidPeriods, ["2026-09", "2026-10"]);
  assert.equal(correction.afterPayments[0].membershipAmountCents, 10000);
  assert.equal(correction.afterPayments[1].membershipAmountCents, 8000);
  assert.equal(correction.afterPayments[1].enrollmentFeeAmountCents, 2000);
  assert.equal(correction.checkoutAuthorized, false);

  const corrected = { ...original, priorPayments: correction.afterPayments };
  const terms = resolveHistoricalCashCheckoutTerms(corrected);
  assert.deepEqual(terms, {
    version: 1,
    mode: "enrollment_payment_then_subscription",
    dueNowCents: 1000,
    enrollmentRemainingCents: 1000,
    monthlyMembershipCents: 8000,
    firstRecurringChargeDate: "2026-11-05",
    unappliedCashHeldCents: 0,
    ledgerFingerprint: "",
  });

  const review = buildClientProposalSnapshot("P-000019", corrected);
  assert.equal(review.historicalCash.recordedCashCents, 20000);
  assert.equal(review.historicalCash.enrollmentRemainingCents, 1000);
  assert.equal(review.pricing.dueNow, 10);
  assert.equal(review.pricing.enrollmentDueNow, 10);
  assert.equal(review.pricing.proratedFirstMonth, 0);
  assert.equal(review.pricing.additionalMembershipMonthsDue, 0);
  assert.equal(review.pricing.monthlyBalance, 80);
  assert.deepEqual(review.historicalCashCheckoutTerms, terms);
});
