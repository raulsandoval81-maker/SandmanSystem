import { createHash } from "node:crypto";
import { lockedPrepaidCoverageMonths } from "./prepaidReconciliationPolicy";
import { resolveFullYearPrepayment, validateFullYearCoverage } from "./prepaidMembershipPolicy";

export type PaymentArrangement = "monthly_autopay" | "prepaid_stripe" | "prepaid_cash_check";
export function paymentArrangement(pricing: Record<string, any>): PaymentArrangement {
  const value = pricing.paymentArrangement ?? "monthly_autopay";
  if (!["monthly_autopay", "prepaid_stripe", "prepaid_cash_check"].includes(value)) {
    throw new Error("Unsupported payment arrangement.");
  }
  return value;
}

export function supportedEnrollmentFeeCents(pricing: Record<string, any>): number {
  const grossCents = Math.round(Number(pricing.enrollmentBase) * 100);
  const supportCents = Math.round(Number(pricing.support || 0) * 100);
  const supportPercent = Number(pricing.supportPercent || 0);
  if (!Number.isSafeInteger(grossCents) || grossCents < 0 ||
      !Number.isSafeInteger(supportCents) || supportCents < 0 ||
      ![0, 25, 50, 75, 100].includes(supportPercent)) {
    throw new Error("Invalid locked enrollment support.");
  }
  const expectedSupportCents = Math.round(grossCents * supportPercent / 100);
  if (supportCents !== expectedSupportCents || supportCents > grossCents) {
    throw new Error("Locked enrollment support does not match the approved percentage.");
  }
  return grossCents - supportCents;
}

// Reuse the V2 term, coverage and per-athlete allocation validators. Pricing
// remains the existing proposal monthly price, never a competing rate table.
export function canonicalPaymentArrangement(pricing: Record<string, any>, athletes: any[]) {
  const arrangement = paymentArrangement(pricing);
  if (arrangement === "monthly_autopay") return pricing;
  if (pricing.billingType === "seasonal_one_time" || !athletes.length ||
      athletes.some(a => String(a.plan).toLowerCase() === "fitness") ||
      Number(pricing.additionalMembershipMonthsDue || 0) || Number(pricing.extraAmount || 0)) {
    throw new Error("Prepaid arrangement requires an unmixed Combat membership without historical fees or extra charges.");
  }
  const months = lockedPrepaidCoverageMonths({lockedSnapshot: {athletes}});
  const monthly = Math.round(Number(pricing.monthlyBalance) * 100);
  const fee = supportedEnrollmentFeeCents(pricing);
  if (!Number.isSafeInteger(monthly) || monthly <= 0 || !Number.isSafeInteger(fee) || fee < 0) {
    throw new Error("Invalid locked prepaid price.");
  }
  const priorFee = Math.round(Number(pricing.enrollmentPreviouslyPaidAmount ?? 0) * 100);
  if (!Number.isSafeInteger(priorFee) || priorFee < 0 ||
      (priorFee > 0 && (arrangement !== "prepaid_cash_check" || athletes.length !== 1 || priorFee !== fee))) {
    throw new Error("Prepaid historical fee credit requires Cash/Check and one athlete with the full net annual fee previously paid.");
  }
  const allocations = pricing.prepaidFeeAllocations ?? athletes.map((a, i) => ({athleteIndex: i + 1, amountCents: (fee - priorFee) / athletes.length}));
  if (!Array.isArray(allocations)) throw new Error("Annual fee allocations are required.");
  const feePaid = allocations.reduce((sum: number, a: any) => sum + Number(a.amountCents), 0);
  const membership = monthly * months;
  const allocation = resolveFullYearPrepayment({amountCents: membership + feePaid,
    membershipAmountCents: membership, expectedMonthlyMembershipCents: monthly, monthsCovered: months,
    enrollmentFeeTotalCents: fee, enrollmentFeePreviouslyPaidCents: priorFee, athletes,
    enrollmentFeeIncludedAthleteIndexes: [], enrollmentFeeAllocations: allocations});
  const start = String(pricing.membershipStartDate || "");
  const renewal = new Date(`${start}T12:00:00Z`);
  if (Number.isNaN(renewal.getTime())) throw new Error("Invalid membership start date.");
  if (months === 12) renewal.setUTCFullYear(renewal.getUTCFullYear() + 1);
  else {
    const day = renewal.getUTCDate();
    const last = new Date(Date.UTC(renewal.getUTCFullYear(), renewal.getUTCMonth() + months + 1, 0)).getUTCDate();
    renewal.setUTCDate(1); renewal.setUTCMonth(renewal.getUTCMonth() + months); renewal.setUTCDate(Math.min(day, last));
  }
  const through = new Date(renewal); through.setUTCDate(through.getUTCDate() - 1);
  const nextBillingDate = renewal.toISOString().slice(0, 10);
  const paidThroughDate = through.toISOString().slice(0, 10);
  validateFullYearCoverage(start, paidThroughDate, nextBillingDate, months);
  return {...pricing, paymentArrangement: arrangement, automaticFuturePayments: false,
    firstRecurringChargeDate: null, recurringBillingDay: null,
    prepaidFeeAllocations: allocation.annualEnrollmentFee.selections.map(a => ({athleteIndex: a.athleteIndex, amountCents: a.amountCents})),
    prepaidTerms: {monthsCovered: months, membershipAmountCents: membership,
      amountCents: membership + feePaid, annualEnrollmentFee: allocation.annualEnrollmentFee,
      membershipStartDate: start, paidThroughDate, nextBillingDate, automaticRenewal: false},
    dueNow: arrangement === "prepaid_stripe" ? (membership + feePaid) / 100 : 0,
    enrollmentDueNow: arrangement === "prepaid_stripe" ? feePaid / 100 : 0};
}
// Keep this projection aligned with the Prospect Builder review contract.
export function prepaidReviewTerms(pricing: Record<string, any>) {
  const arrangement = paymentArrangement(pricing);
  if (arrangement === "monthly_autopay") return null;
  const terms = pricing.prepaidTerms;
  return [
    arrangement,
    terms.monthsCovered,
    terms.membershipAmountCents,
    terms.amountCents,
    terms.membershipStartDate,
    terms.paidThroughDate,
    terms.nextBillingDate,
    Math.round(Number(pricing.support || 0) * 100),
    terms.annualEnrollmentFee.previouslyPaidCents,
    terms.annualEnrollmentFee.outstandingCents,
    pricing.prepaidFeeAllocations.map(({athleteIndex, amountCents}: {athleteIndex: number; amountCents: number}) => [athleteIndex, amountCents]),
  ];
}
export function lockedPrepaidTerms(proposal: Record<string, any>) {
  const snapshot = proposal.lockedSnapshot;
  if (!snapshot || !proposal.clientAcceptance?.signedAt || JSON.stringify(proposal.clientAcceptance?.signedSnapshot) !== JSON.stringify(snapshot)) {
    throw new Error("Family acceptance must match the locked prepaid terms.");
  }
  const canonical = canonicalPaymentArrangement(snapshot.pricing, snapshot.athletes);
  if (paymentArrangement(canonical) === "monthly_autopay" ||
      JSON.stringify(canonical.prepaidTerms) !== JSON.stringify(snapshot.pricing.prepaidTerms)) {
    throw new Error("Prepaid terms do not match the locked agreement.");
  }
  return canonical.prepaidTerms;
}
export function prepaidFingerprint(proposal: Record<string, any>): string {
  lockedPrepaidTerms(proposal);
  return createHash("sha256").update(JSON.stringify(proposal.lockedSnapshot)).digest("hex");
}
