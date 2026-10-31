import { createHash } from "node:crypto";
import { summarizeHistoricalCash } from "./historicalCashReconciliation";

export type HistoricalCashDispositionKind =
  | "hold_unapplied"
  | "future_month_credit_pending"
  | "refund_pending";

export type HistoricalCashDispositionDecision = {
  kind: HistoricalCashDispositionKind;
  amountCents: number;
  targetPeriod: string | null;
  ledgerFingerprint: string;
  review: ReturnType<typeof summarizeHistoricalCash>;
};

/**
 * Records an explicit decision, not the execution of a credit or a refund.
 * All cash movements and first Stripe charges remain disabled pending a
 * family-approved billing snapshot and verified payment implementation.
 */
export function validateHistoricalCashDisposition(input: {
  priorPayments: Array<Record<string, unknown>>;
  monthlyMembershipCents: number;
  enrollmentFeeCents: number;
  kind: string;
  amountCents: number;
  targetPeriod?: string | null;
}): HistoricalCashDispositionDecision {
  const review = summarizeHistoricalCash(input);
  if (review.issues.length) {
    throw new Error("Resolve historical ledger inconsistencies before recording a disposition.");
  }
  if (review.unappliedMembershipCents <= 0) {
    throw new Error("There is no unapplied historical membership cash to disposition.");
  }
  if (!Number.isSafeInteger(input.amountCents) ||
      input.amountCents !== review.unappliedMembershipCents) {
    throw new Error("The decision must account for the entire unapplied cash amount in cents.");
  }
  if (!["hold_unapplied", "future_month_credit_pending", "refund_pending"].includes(input.kind)) {
    throw new Error("The selected historical cash disposition is unsupported.");
  }
  const period = String(input.targetPeriod || "").trim();
  if (input.kind === "future_month_credit_pending") {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new Error("Future-month credit proposals must identify a YYYY-MM membership period.");
    }
    const covered = review.membershipPaidByPeriodCents[period] || 0;
    if (covered + input.amountCents > review.monthlyMembershipCents) {
      throw new Error("The proposed credit would exceed the target month's membership charge.");
    }
    const paidPeriods = Object.keys(review.membershipPaidByPeriodCents).sort();
    const latestPaidPeriod = paidPeriods[paidPeriods.length - 1];
    if (latestPaidPeriod && period <= latestPaidPeriod) {
      throw new Error("Future-month credit proposals must target a month after existing recorded cash coverage.");
    }
  } else if (period) {
    throw new Error("Only proposed future-month credits may specify a target month.");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({
    monthlyMembershipCents: review.monthlyMembershipCents,
    enrollmentFeeCents: review.enrollmentFeeCents,
    priorPayments: input.priorPayments,
  })).digest("hex");
  return {
    kind: input.kind as HistoricalCashDispositionKind,
    amountCents: input.amountCents,
    targetPeriod: period || null,
    ledgerFingerprint: fingerprint,
    review,
  };
}
