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
  }
  if (!complete || enrollmentPaidCents > feeCents) return null;
  return {
    paymentCount: payments.length,
    totalReceivedCents,
    enrollmentFeeCents: feeCents,
    enrollmentPaidCents,
    enrollmentRemainingCents: feeCents - enrollmentPaidCents,
    corrected: Boolean(proposal?.historicalPaymentCorrection?.historyId),
  };
}
