import {
  summarizeHistoricalCash,
  type HistoricalCashReview,
} from "./historicalCashReconciliation";

export type HistoricalCashPaymentPlan = {
  review: HistoricalCashReview;
  period: string;
  chargeDate: string;
  futureMonthlyAmountCents: number;
  periodAlreadyPaidCents: number;
  periodOutstandingCents: number;
  enrollmentRemainingCents: number;
  unappliedMembershipCents: number;
  // Merely a breakdown of potential obligations; NOT a Stripe checkout amount.
  totalOutstandingBeforeUnappliedDecisionCents: number;
  blockers: string[];
  readyForCheckout: false;
};

/**
 * Create a deterministic ledger-to-schedule preview, not a bill.
 *
 * The payment recorded for a month cannot be automatically applied to another
 * month or to the enrollment fee. Any remainder requires an explicit decision
 * and a new family-approved locked billing snapshot. Checkout remains blocked.
 */
export function previewHistoricalCashPaymentPlan(input: {
  priorPayments: Array<Record<string, unknown>>;
  monthlyMembershipCents: number;
  enrollmentFeeCents: number;
  chargeDate: string;
}): HistoricalCashPaymentPlan {
  const date = input.chargeDate;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-05$/.test(date)) {
    throw new Error("A fifth-of-month YYYY-MM-05 charge date is required.");
  }
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Charge date must be a real calendar date.");
  }
  const review = summarizeHistoricalCash({
    priorPayments: input.priorPayments,
    monthlyMembershipCents: input.monthlyMembershipCents,
    enrollmentFeeCents: input.enrollmentFeeCents,
  });
  const period = date.slice(0, 7);
  const periodAlreadyPaidCents = review.membershipPaidByPeriodCents[period] || 0;
  const periodOutstandingCents = Math.max(0, review.monthlyMembershipCents - periodAlreadyPaidCents);
  const blockers = [...review.issues];
  if (review.unappliedMembershipCents > 0) {
    blockers.push("Unapplied historical cash requires an explicit Management disposition.");
  }
  if (periodAlreadyPaidCents > 0) {
    blockers.push("Scheduled billing period already has cash coverage; Stripe amount requires explicit reconciliation.");
  }
  blockers.push("A new signed proposal must authorize the reconciled amount and first Stripe charge date.");
  blockers.push("A test-mode Stripe schedule must be proven without duplicate membership charges.");
  return {
    review,
    period,
    chargeDate: date,
    futureMonthlyAmountCents: review.monthlyMembershipCents,
    periodAlreadyPaidCents,
    periodOutstandingCents,
    enrollmentRemainingCents: review.enrollmentRemainingCents,
    unappliedMembershipCents: review.unappliedMembershipCents,
    totalOutstandingBeforeUnappliedDecisionCents:
      periodOutstandingCents + review.enrollmentRemainingCents,
    blockers,
    readyForCheckout: false,
  };
}
