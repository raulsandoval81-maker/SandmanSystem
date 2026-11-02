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

export function assertPrepaidReconciliationCanBePrepared(
  proposal: Record<string, any>
): void {
  if (clean(proposal.status).toUpperCase() !== "READY_FOR_CHECKOUT") {
    throw new Error("Paid-in-full reconciliation can only be prepared for a checkout-ready proposal.");
  }
  if (!proposal.clientAcceptance?.signedAt ||
      !proposal.clientAcceptance?.signedSnapshot ||
      !proposal.lockedSnapshot) {
    throw new Error("The family must accept the locked proposal before paid-in-full reconciliation is prepared.");
  }
  if (JSON.stringify(proposal.clientAcceptance.signedSnapshot) !==
      JSON.stringify(proposal.lockedSnapshot)) {
    throw new Error("The accepted proposal no longer matches the locked enrollment terms.");
  }
  const athletes = Array.isArray(proposal.lockedSnapshot?.athletes)
    ? proposal.lockedSnapshot.athletes
    : [];
  const membershipAthletes = athletes.filter(
    (athlete: Record<string, any>) => clean(athlete?.plan || "standard").toLowerCase() !== "fitness"
  );
  if (!membershipAthletes.length || membershipAthletes.some(
    (athlete: Record<string, any>) =>
      !["annual", "12_month", "twelve_month"].includes(
        clean(athlete?.billingTerm).toLowerCase()
      )
  )) {
    throw new Error("Paid-in-full reconciliation requires a locked 12-month membership agreement.");
  }
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
