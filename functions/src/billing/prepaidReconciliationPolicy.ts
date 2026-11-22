export const PREPAID_RECONCILIATION_ROUTE =
  "management_prepaid_reconciliation" as const;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export function hasConflictingStripeActivity(
  proposal: Record<string, any>
): boolean {
  return [
    proposal.stripePaymentIntentId,
    proposal.stripeCheckoutSessionId,
    proposal.pendingCheckoutSessionId,
    proposal.stripeSubscriptionId,
    proposal.stripeInvoiceId,
    proposal.stripeCustomerId,
  ].some((value) => Boolean(clean(value)));
}

export function hasRecordedMembershipPayment(
  proposal: Record<string, any>
): boolean {
  const payments = Array.isArray(proposal.priorPayments)
    ? proposal.priorPayments
    : [];
  return payments.some((payment: Record<string, any>) =>
    Number(payment?.membershipAmountCents || 0) > 0 ||
    (Array.isArray(payment?.membershipPeriodAllocations) &&
      payment.membershipPeriodAllocations.length > 0) ||
    (Array.isArray(payment?.periods) && payment.periods.length > 0)
  );
}

export function isPreparedForPrepaidReconciliation(
  proposal: Record<string, any>
): boolean {
  return clean(proposal.prepaidReconciliation?.status).toUpperCase() ===
    "AWAITING_FAMILY_CONFIRMATION";
}

// Never let a prepared Cash/Check case render the generic monthly/Stripe
// confirmation page when its locked prepaid display terms are absent.
export function assertCashCheckFamilyReviewTerms(proposal: Record<string, any>): void {
  const pricing = proposal.lockedSnapshot?.pricing || {};
  const terms = pricing.prepaidTerms;
  const months = Number(terms?.monthsCovered);
  const monthlyCents = Math.round(Number(pricing.monthlyBalance) * 100);
  const membershipCents = Number(terms?.membershipAmountCents);
  const fee = terms?.annualEnrollmentFee;
  if (clean(pricing.paymentArrangement) !== "prepaid_cash_check" ||
      ![6, 12].includes(months) ||
      !Number.isSafeInteger(monthlyCents) || monthlyCents <= 0 ||
      !Number.isSafeInteger(membershipCents) || membershipCents !== monthlyCents * months ||
      !fee || !Number.isSafeInteger(Number(fee.outstandingCents)) ||
      Number(fee.outstandingCents) < 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(clean(terms?.membershipStartDate)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(clean(terms?.paidThroughDate)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(clean(terms?.nextBillingDate)) ||
      terms?.automaticRenewal !== false) {
    throw new Error("Cash/Check Paid-in-Full terms are missing or inconsistent in the signed proposal. Management must correct the agreement; do not proceed to Stripe.");
  }
}

// Term is derived exclusively from the family's accepted, locked snapshot.
// Never trust a client-supplied month count or silently mix household terms.
export function lockedPrepaidCoverageMonths(
  proposal: Record<string, any>
): 6 | 12 {
  const athletes = Array.isArray(proposal.lockedSnapshot?.athletes)
    ? proposal.lockedSnapshot.athletes
    : [];
  const members = athletes.filter(
    (athlete: Record<string, any>) =>
      clean(athlete?.plan || "standard").toLowerCase() !== "fitness"
  );
  if (!members.length) {
    throw new Error("At least one Combat membership is required for prepaid reconciliation.");
  }
  const terms = members.map((athlete: Record<string, any>) => {
    const term = clean(athlete?.billingTerm).toLowerCase();
    if (["annual", "12_month", "twelve_month"].includes(term)) return 12;
    if (["six-month", "sixmonth", "six_month", "6_month"].includes(term)) return 6;
    throw new Error("Paid-in-full reconciliation requires a locked 6- or 12-month membership agreement.");
  });
  if (terms.some((term: number) => term !== terms[0])) {
    throw new Error("Paid-in-full household members must have the same agreement duration.");
  }
  return terms[0] as 6 | 12;
}

export function assertPrepaidReconciliationCanBePrepared(
  proposal: Record<string, any>
): void {
  if (clean(proposal.status).toUpperCase() !== "READY_FOR_CHECKOUT") {
    throw new Error("Paid-in-full reconciliation can only be prepared for a checkout-ready proposal.");
  }
  // A 6/12-month term alone is not a Cash/Check paid-in-full agreement.
  // Never silently convert a signed monthly or Stripe agreement during preparation.
  if (clean(proposal.lockedSnapshot?.pricing?.paymentArrangement) !== "prepaid_cash_check") {
    throw new Error("The signed proposal must lock a Cash/Check Paid-in-Full payment arrangement before reconciliation.");
  }
  assertCashCheckFamilyReviewTerms(proposal);
  if (!proposal.clientAcceptance?.signedAt ||
      !proposal.clientAcceptance?.signedSnapshot ||
      !proposal.lockedSnapshot) {
    throw new Error("The family must accept the locked proposal before paid-in-full reconciliation is prepared.");
  }
  if (JSON.stringify(proposal.clientAcceptance.signedSnapshot) !==
      JSON.stringify(proposal.lockedSnapshot)) {
    throw new Error("The accepted proposal no longer matches the locked enrollment terms.");
  }
  lockedPrepaidCoverageMonths(proposal);
  if (Number(proposal.lockedSnapshot?.pricing?.monthlyBalance || 0) <= 0) {
    throw new Error("The locked monthly membership amount is invalid.");
  }
  if (proposal.cashPrepayment || hasRecordedMembershipPayment(proposal)) {
    throw new Error("A membership payment is already recorded for this proposal.");
  }
  if (hasConflictingStripeActivity(proposal)) {
    throw new Error("Stripe activity already exists for this proposal.");
  }
}

export function assertPrepaidFamilyConfirmation(
  proposal: Record<string, any>
): void {
  if (!isPreparedForPrepaidReconciliation(proposal)) {
    throw new Error("Management must prepare the paid-in-full reconciliation route first.");
  }
  const confirmation = proposal.enrollmentConfirmation || {};
  const confirmedAtMillis = typeof confirmation.confirmedAt?.toMillis === "function"
    ? confirmation.confirmedAt.toMillis()
    : NaN;
  if (confirmation.termsConfirmed !== true ||
      !Number.isFinite(confirmedAtMillis) || confirmedAtMillis <= 0) {
    throw new Error("Completed Review & Confirm is required before recording paid-in-full cash or check.");
  }
}

/** Uses the existing, server-recorded agreement for cash received before this proposal. */
export function assertHistoricalPrepaidReconciliation(
  proposal: Record<string, any>,
  paymentDate: string
): void {
  assertPrepaidReconciliationCanBePrepared(proposal);
  if (proposal.lockedSnapshot.pricing.paymentArrangement !== "prepaid_cash_check") {
    throw new Error("Historical reconciliation requires a locked Cash/Check Paid-in-Full agreement.");
  }

  const signedAt = proposal.clientAcceptance.signedAt?.toMillis?.();
  if (proposal.clientAcceptance.consentAccepted !== true || !Number.isFinite(signedAt) || signedAt <= 0) {
    throw new Error("A timestamped family acceptance of the locked agreement is required.");
  }

  const createdAt = proposal.createdAt?.toMillis?.();
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    throw new Error("The existing proposal creation date could not be verified.");
  }
  const proposalDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(createdAt);
  if (paymentDate >= proposalDate) {
    throw new Error("Historical payment must predate the existing proposal.");
  }
}
