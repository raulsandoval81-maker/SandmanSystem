import { validateHistoricalCashDisposition } from "./historicalCashDisposition";
import { summarizeHistoricalCash } from "./historicalCashReconciliation";

const cents = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) {
    throw new Error("Historical cash checkout needs valid dollar pricing.");
  }
  return Math.round(n * 100);
};

function nextMonth(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type HistoricalCashCheckoutTerms = {
  version: 1;
  mode: "enrollment_payment_then_subscription";
  dueNowCents: number;
  enrollmentRemainingCents: number;
  monthlyMembershipCents: number;
  firstRecurringChargeDate: string;
  unappliedCashHeldCents: number;
  ledgerFingerprint: string;
};

/**
 * Executable only for explicitly HELD unapplied cash.
 *
 * No auto-credits, no refund promise, no prior-month charge, and no
 * retroactive billing. Requiring continuous paid coverage through the
 * month before the first scheduled recurring charge prevents gaps.
 * Anything else needs a new, family-approved billing path.
 */
export function resolveHistoricalCashCheckoutTerms(
  proposal: Record<string, any>
): HistoricalCashCheckoutTerms | null {
  const payments = Array.isArray(proposal.priorPayments)
    ? proposal.priorPayments as Array<Record<string, unknown>>
    : [];
  if (!payments.length) return null;
  const pricing = proposal.pricing || {};
  const monthlyMembershipCents = cents(pricing.monthlyBalance);
  const enrollmentFeeCents = cents(pricing.enrollmentBase);
  if (monthlyMembershipCents < 50) {
    throw new Error("Historical cash membership price is invalid.");
  }
  const review = summarizeHistoricalCash({
    priorPayments: payments, monthlyMembershipCents, enrollmentFeeCents,
  });
  if (review.issues.length || review.partiallyPaidPeriods.length) {
    throw new Error("Historical cash has inconsistent or partially paid monthly coverage.");
  }
  const paid = review.fullyPaidPeriods;
  if (!paid.length) {
    throw new Error("Historical cash contains no fully paid membership month.");
  }
  for (let i = 1; i < paid.length; i += 1) {
    if (nextMonth(paid[i - 1]) !== paid[i]) {
      throw new Error("Historical cash months must have continuous paid coverage.");
    }
  }
  const firstRecurringChargeDate = String(pricing.firstRecurringChargeDate || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-05$/.test(firstRecurringChargeDate) ||
      firstRecurringChargeDate.slice(0, 7) !== nextMonth(paid[paid.length - 1])) {
    throw new Error("First recurring charge must be on the fifth of the month immediately after paid coverage.");
  }
  const start = String(pricing.membershipStartDate || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(start) ||
      start.slice(0, 7) !== paid[0]) {
    throw new Error("Membership start must match the first fully paid historical month.");
  }
  if (review.enrollmentRemainingCents < 50) {
    throw new Error("A no-charge first payment requires a separate card-setup flow.");
  }
  const disposition = proposal.historicalCashDisposition;
  if (review.unappliedMembershipCents > 0) {
    if (disposition?.status !== "recorded" || disposition.kind !== "hold_unapplied") {
      throw new Error("Executable billing requires an explicit hold of unapplied cash; proposed credits/refunds are not executed.");
    }
  } else if (disposition?.status === "recorded") {
    throw new Error("A cash disposition exists without unapplied cash.");
  }
  const decision = review.unappliedMembershipCents > 0
    ? validateHistoricalCashDisposition({
      priorPayments: payments, monthlyMembershipCents, enrollmentFeeCents,
      kind: disposition.kind, amountCents: disposition.amountCents,
      targetPeriod: disposition.targetPeriod,
    })
    : null;
  if (decision && disposition.ledgerFingerprint !== decision.ledgerFingerprint) {
    throw new Error("Management's held-cash decision no longer matches the payment ledger.");
  }
  return {
    version: 1,
    mode: "enrollment_payment_then_subscription",
    dueNowCents: review.enrollmentRemainingCents,
    enrollmentRemainingCents: review.enrollmentRemainingCents,
    monthlyMembershipCents,
    firstRecurringChargeDate,
    unappliedCashHeldCents: review.unappliedMembershipCents,
    ledgerFingerprint: decision?.ledgerFingerprint || "",
  };
}
