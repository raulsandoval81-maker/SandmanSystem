import { lockedPrepaidMonths, prepaidCoverageDates } from "/management/billing/prepaid-terms.js";

// Display preview only; the callable independently rebuilds and validates terms.
export function previewPaymentArrangement(pricing, athletes, arrangement, allocations) {
  if (arrangement === "monthly_autopay") return {...pricing, paymentArrangement: arrangement};
  if (!["prepaid_stripe", "prepaid_cash_check"].includes(arrangement)) throw Error("Unsupported payment arrangement.");
  const months = lockedPrepaidMonths({lockedSnapshot: {athletes}});
  if (!months || athletes.some(a => a.plan === "fitness") || Number(pricing.extraAmount) ||
      Number(pricing.additionalMembershipMonthsDue) || Number(pricing.enrollmentPreviouslyPaidAmount)) {
    throw Error("Paid in Full requires matching 6- or 12-month Combat commitments, without extras or historical fee credits.");
  }
  const coverage = prepaidCoverageDates(pricing.membershipStartDate, months);
  if (!coverage) throw Error("A valid membership start date is required.");
  const membership = Math.round(pricing.monthlyBalance * 100) * months;
  const totalFee = Math.round(pricing.enrollmentBase * 100);
  const perAthlete = totalFee / athletes.length;
  if (allocations.length !== athletes.length || allocations.some((a, i) =>
      a.athleteIndex !== i + 1 || !Number.isSafeInteger(a.amountCents) || a.amountCents < 0 || a.amountCents > perAthlete)) {
    throw Error("Each annual fee allocation must be between zero and that athlete's fee.");
  }
  const feePaid = allocations.reduce((n, a) => n + a.amountCents, 0);
  return {...pricing, paymentArrangement: arrangement, firstRecurringChargeDate: null, recurringBillingDay: null, automaticFuturePayments: false, prepaidFeeAllocations: allocations,
    dueNow: arrangement === "prepaid_stripe" ? (membership + feePaid) / 100 : 0,
    prepaidTerms: {monthsCovered: months, membershipAmountCents: membership, amountCents: membership + feePaid,
      membershipStartDate: pricing.membershipStartDate, paidThroughDate: coverage.paidThroughDate,
      nextBillingDate: coverage.nextBillingDate, feeOutstandingCents: totalFee - feePaid}};
}
