/**
 * Read-only, proposal-backed payment summary shared by Management screens.
 * Do not use this UI projection to authorize checkout or activation.
 * All amounts here are integer cents; proposal.pricing remains the offer,
 * and server-side historical cash terms govern payment execution.
 */
export function historicalPaymentSummary(proposal) {
  const payments = Array.isArray(proposal?.priorPayments) ? proposal.priorPayments : [];
  const feeDollars = proposal?.pricing?.enrollmentBase;
  const feeCents = Math.round(Number(feeDollars) * 100);
  if (!payments.length || feeDollars === null || feeDollars === undefined ||
      !Number.isSafeInteger(feeCents) || feeCents < 0) return null;
  let totalReceivedCents = 0;
  let enrollmentPaidCents = 0;
  let complete = true;
  let membershipLedgerComplete = true;
  const membershipPaidByPeriodCents = new Map();
  const membershipRequiredByPeriodCents = new Map();
  for (const payment of payments) {
    const amount = Number(payment?.amountCents);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      complete = false;
      continue;
    }
    totalReceivedCents += amount;
    const explicit = payment?.enrollmentFeeAmountCents;
    let applied;
    if (explicit !== undefined && explicit !== null && explicit !== "") {
      applied = Number(explicit);
    } else {
      applied = payment?.enrollmentFeeIncluded === true ? feeCents : 0;
    }
    if (!Number.isSafeInteger(applied) || applied < 0 || applied > amount) {
      complete = false;
      continue;
    }
    enrollmentPaidCents += applied;

    const membershipAmountCents = Number(payment?.membershipAmountCents);
    const unappliedMembershipAmountCents = Number(payment?.unappliedMembershipAmountCents);
    const allocations = payment?.membershipPeriodAllocations;
    if (!Number.isSafeInteger(membershipAmountCents) || membershipAmountCents < 0 ||
        !Number.isSafeInteger(unappliedMembershipAmountCents) || unappliedMembershipAmountCents < 0 ||
        !Array.isArray(allocations)) {
      membershipLedgerComplete = false;
      continue;
    }
    if (amount !== membershipAmountCents + applied) {
      membershipLedgerComplete = false;
    }
    const historicalRateCents = payment?.historicalMonthlyRateCents === undefined
      ? Math.round(Number(proposal?.pricing?.monthlyBalance) * 100)
      : Number(payment.historicalMonthlyRateCents);
    if (!Number.isSafeInteger(historicalRateCents) || historicalRateCents <= 0) {
      membershipLedgerComplete = false;
      continue;
    }
    let allocatedCents = 0;
    for (const allocation of allocations) {
      const period = String(allocation?.period || "");
      const paidCents = Number(allocation?.paidCents);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
          !Number.isSafeInteger(paidCents) || paidCents < 0) {
        membershipLedgerComplete = false;
        continue;
      }
      if (allocation?.requiredCents !== undefined &&
          Number(allocation.requiredCents) !== historicalRateCents) {
        membershipLedgerComplete = false;
      }
      const existingRequired = membershipRequiredByPeriodCents.get(period);
      if (existingRequired !== undefined && existingRequired !== historicalRateCents) {
        membershipLedgerComplete = false;
      }
      membershipRequiredByPeriodCents.set(period, historicalRateCents);
      membershipPaidByPeriodCents.set(
        period,
        (membershipPaidByPeriodCents.get(period) || 0) + paidCents
      );
      allocatedCents += paidCents;
    }
    if (allocatedCents + unappliedMembershipAmountCents !== membershipAmountCents) {
      membershipLedgerComplete = false;
    }
  }
  for (const [period, paidCents] of membershipPaidByPeriodCents) {
    if (paidCents > membershipRequiredByPeriodCents.get(period)) {
      membershipLedgerComplete = false;
    }
  }
  if (!complete || enrollmentPaidCents > feeCents) return null;
  return {
    paymentCount: payments.length,
    totalReceivedCents,
    enrollmentFeeCents: feeCents,
    enrollmentPaidCents,
    enrollmentRemainingCents: feeCents - enrollmentPaidCents,
    membershipLedgerComplete,
    fullyPaidPeriods: membershipLedgerComplete
      ? [...membershipPaidByPeriodCents.entries()]
          .filter(([period, paidCents]) =>
            paidCents === membershipRequiredByPeriodCents.get(period)
          )
          .map(([period]) => period)
          .sort()
      : [],
    corrected: Boolean(proposal?.historicalPaymentCorrection?.historyId),
  };
}
