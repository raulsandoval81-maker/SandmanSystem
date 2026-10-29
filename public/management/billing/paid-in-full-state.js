export function paidInFullUiState(proposal = {}) {
  const payment = proposal.cashPrepayment || {};
  const isPaidInFull = payment.membershipPaidInFull === true;
  const feeOutstandingCents = Number(
    payment.annualEnrollmentFee?.outstandingCents || 0
  );
  const followUp = String(proposal.billingFollowUpStatus || "").toUpperCase();

  return {
    isPaidInFull,
    label: isPaidInFull ? "Membership Paid in Full" : "",
    feeOutstandingCents,
    canApproveRenewal:
      isPaidInFull && followUp === "RENEWAL_AUTOPAY_APPROVAL_REQUIRED",
    canSetupAutopay:
      isPaidInFull && followUp === "AUTOPAY_SETUP_REQUIRED",
  };
}
