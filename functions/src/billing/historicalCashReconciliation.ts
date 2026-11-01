/**
 * Auditable, read-only historical cash summary.
 * This is NOT authorization for Stripe checkout or enrollment activation.
 * Never infer the disposition of unapplied cash or legacy missing allocations.
 */
export type HistoricalCashReview = {
  monthlyMembershipCents: number;
  enrollmentFeeCents: number;
  enrollmentPaidCents: number;
  enrollmentRemainingCents: number;
  membershipPaidByPeriodCents: Record<string, number>;
  fullyPaidPeriods: string[];
  partiallyPaidPeriods: string[];
  unappliedMembershipCents: number;
  totalRecordedCents: number;
  issues: string[];
  requiresManagementReview: boolean;
};

function nonnegativeInteger(value: unknown): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function summarizeHistoricalCash(input: {
  priorPayments: Array<Record<string, unknown>>;
  monthlyMembershipCents: number;
  enrollmentFeeCents: number;
}): HistoricalCashReview {
  const monthly = nonnegativeInteger(input.monthlyMembershipCents);
  const fee = nonnegativeInteger(input.enrollmentFeeCents);
  if (monthly === null || monthly === 0 || fee === null) {
    throw new Error("Historical cash review requires valid membership and enrollment amounts.");
  }
  const issues: string[] = [];
  const totals = new Map<string, number>();
  const requiredByPeriod = new Map<string, number>();
  const seenIds = new Set<string>();
  let recorded = 0;
  let enrollmentPaid = 0;
  let unapplied = 0;
  for (const [index, payment] of input.priorPayments.entries()) {
    const id = String(payment.paymentId ?? "").trim();
    if (id && seenIds.has(id)) issues.push(`Duplicate payment reference at entry ${index}.`);
    if (id) seenIds.add(id);
    const amount = nonnegativeInteger(payment.amountCents);
    const membership = nonnegativeInteger(payment.membershipAmountCents);
    const enrollment = nonnegativeInteger(payment.enrollmentFeeAmountCents);
    const remainder = nonnegativeInteger(payment.unappliedMembershipAmountCents);
    if (amount === null || membership === null || enrollment === null || remainder === null) {
      issues.push(`Payment entry ${index} lacks a complete cents allocation.`);
      continue;
    }
    recorded += amount;
    enrollmentPaid += enrollment;
    unapplied += remainder;
    if (amount !== membership + enrollment) {
      issues.push(`Payment entry ${index} does not balance membership and enrollment.`);
    }
    const historicalRate = payment.historicalMonthlyRateCents === undefined
      ? null : nonnegativeInteger(payment.historicalMonthlyRateCents);
    if (payment.historicalMonthlyRateCents !== undefined &&
        (historicalRate === null || historicalRate <= 0)) {
      issues.push(`Payment entry ${index} contains an invalid historical membership rate.`);
    }
    const allocations = payment.membershipPeriodAllocations;
    if (!Array.isArray(allocations)) {
      issues.push(`Payment entry ${index} has no auditable monthly allocation.`);
      continue;
    }
    let allocated = 0;
    const localPeriods = new Set<string>();
    for (const raw of allocations) {
      const allocation = raw as Record<string, unknown>;
      const period = String(allocation?.period ?? "").trim();
      const paid = nonnegativeInteger(allocation?.paidCents);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || paid === null) {
        issues.push(`Payment entry ${index} contains an invalid monthly allocation.`);
        continue;
      }
      if (localPeriods.has(period)) {
        issues.push(`Payment entry ${index} repeats month ${period}.`);
      }
      localPeriods.add(period);
      const required = historicalRate || monthly;
      if (historicalRate !== null && allocation.requiredCents !== historicalRate) {
        issues.push(`Payment entry ${index} historical rate does not match allocation requirement.`);
      }
      if (requiredByPeriod.has(period) && requiredByPeriod.get(period) !== required) {
        issues.push(`Conflicting contractual membership rates for ${period}.`);
      }
      requiredByPeriod.set(period, required!);
      allocated += paid;
      totals.set(period, (totals.get(period) || 0) + paid);
    }
    if (allocated + remainder !== membership) {
      issues.push(`Payment entry ${index} has unbalanced monthly allocations.`);
    }
  }
  if (enrollmentPaid > fee) issues.push("Historical enrollment payments exceed the annual fee.");
  for (const [period, paid] of totals) {
    if (paid > (requiredByPeriod.get(period) || monthly!)) issues.push(`Historical membership allocation exceeds the contractual rate for ${period}.`);
  }
  const sorted = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  const membershipPaidByPeriodCents = Object.fromEntries(sorted);
  return {
    monthlyMembershipCents: monthly,
    enrollmentFeeCents: fee,
    enrollmentPaidCents: enrollmentPaid,
    enrollmentRemainingCents: Math.max(0, fee - enrollmentPaid),
    membershipPaidByPeriodCents,
    fullyPaidPeriods: sorted.filter(([p, paid]) => paid === (requiredByPeriod.get(p) || monthly!)).map(([p]) => p),
    partiallyPaidPeriods: sorted.filter(([p, paid]) => paid < (requiredByPeriod.get(p) || monthly!)).map(([p]) => p),
    unappliedMembershipCents: unapplied,
    totalRecordedCents: recorded,
    issues,
    requiresManagementReview: issues.length > 0 || unapplied > 0,
  };
}
