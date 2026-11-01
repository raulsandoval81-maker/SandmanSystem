/**
 * Narrow, fail-closed correction of P-000019's two EXISTING receipts.
 * September was $100 month-to-month; October was $80 agreement membership
 * plus $20 toward the $30 enrollment charge.
 * This function never creates or collects money.
 */
export function correctP000019Payments(proposal: Record<string, any>) {
  if (proposal.proposalId !== "P-000019" ||
      proposal.locationId !== "santa-ynez-valley") {
    throw new Error("Correction is limited to P-000019 at Santa Ynez Valley.");
  }
  if (String(proposal.status || "").toUpperCase() !== "DRAFT" ||
      proposal.clientReview?.tokenHash ||
      proposal.historicalCashDisposition?.status === "recorded" ||
      proposal.historicalPaymentCorrection) {
    throw new Error("Proposal is not in an eligible, uncorrected draft state.");
  }
  if (Number(proposal.pricing?.enrollmentBase) !== 30 ||
      Number(proposal.pricing?.monthlyBalance) !== 80) {
    throw new Error("Current October agreement pricing differs from the approved $80/$30.");
  }
  const payments = proposal.priorPayments;
  if (!Array.isArray(payments) || payments.length !== 2) {
    throw new Error("Expected exactly two historical payments, no more and no less.");
  }
  const byMonth = new Map<string, Record<string, any>>();
  for (const payment of payments) {
    if (payment?.amountCents !== 10000 ||
        payment?.paymentMethod !== "cash" ||
        !Array.isArray(payment?.periods) || payment.periods.length !== 1 ||
        !["2026-09", "2026-10"].includes(payment.periods[0]) ||
        byMonth.has(payment.periods[0])) {
      throw new Error("Receipt amount, payment method, period, or uniqueness does not match verified records.");
    }
    if (payment.enrollmentFeeIncluded === true ||
        Number(payment.enrollmentFeeAmountCents || 0) !== 0) {
      throw new Error("An enrollment allocation already exists; do not overwrite.");
    }
    byMonth.set(payment.periods[0], payment);
  }
  if (byMonth.size !== 2) throw new Error("September and October receipts are both required.");
  const expected = { "2026-09": { membership: 10000, enrollment: 0, rate: 10000 },
                     "2026-10": { membership: 8000, enrollment: 2000, rate: 8000 } };
  const corrected = payments.map((payment: Record<string, any>) => {
    const period = payment.periods[0] as "2026-09" | "2026-10";
    const plan = expected[period];
    return {
      ...payment,
      membershipAmountCents: plan.membership,
      enrollmentFeeAmountCents: plan.enrollment,
      enrollmentFeeIncluded: false,
      unappliedMembershipAmountCents: 0,
      requestedPeriods: [period],
      membershipPeriodAllocations: [{
        period,
        paidCents: plan.membership,
        previouslyPaidCents: 0,
        totalPaidCents: plan.membership,
        requiredCents: plan.rate,
        fullyPaid: true,
      }],
      // Historical immutable month-specific contractual charge.
      // October's $80 agreement price does NOT reprice September.
      historicalMonthlyRateCents: plan.rate,
    };
  });
  if (corrected.reduce((sum: number, p: Record<string, any>) =>
      sum + p.amountCents, 0) !== 20000) {
    throw new Error("The original $200 total must be preserved.");
  }
  return {
    corrected,
    before: payments,
    totalReceivedCents: 20000,
    enrollmentPaidCents: 2000,
    enrollmentRemainingCents: 1000,
  };
}
