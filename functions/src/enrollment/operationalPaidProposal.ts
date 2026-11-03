/** Strict staging-only exceptions for synthetic enrollment acceptance.
 * Never infer staging solely from a proposal, a Stripe session, or a label.
 */
export const STAGING_PROJECT_ID = "sandman-combat-staging";

export function isStagingEnrollmentRuntime(
  environment: Record<string, string | undefined> = process.env
): boolean {
  const project =
    environment.GCLOUD_PROJECT ||
    environment.GCP_PROJECT ||
    environment.GOOGLE_CLOUD_PROJECT;
  return project === STAGING_PROJECT_ID &&
    environment.SANDMAN_STAGING_ACK === STAGING_PROJECT_ID &&
    environment.SANDMAN_STAGING_PROJECT_ID === STAGING_PROJECT_ID;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export function isOperationalPaidProposal(
  proposal: Record<string, any>,
  environment: Record<string, string | undefined> = process.env
): boolean {
  const status = clean(proposal.status).toUpperCase();
  const paymentStatus = clean(proposal.paymentStatus).toLowerCase();
  const paymentMethod = clean(proposal.paymentMethod).toLowerCase();
  const checkoutSessionId = clean(proposal.stripeCheckoutSessionId);
  const recordedCash =
    paymentMethod === "cash_prepaid" &&
    Boolean(proposal.cashPrepayment) &&
    Number(proposal.cashPrepayment?.amountCents || 0) > 0 &&
    (
      proposal.cashPrepayment?.membershipPaidInFull === true ||
      typeof proposal.cashPrepayment?.membershipPaidInFull !== "boolean"
    );

  // Preserve the existing production acceptance rule exactly.
  const liveStripe =
    Boolean(checkoutSessionId) &&
    !checkoutSessionId.startsWith("cs_test_") &&
    (proposal.stripeLivemode === true || checkoutSessionId.startsWith("cs_live_"));

  // Test-mode evidence is eligible only on the actual isolated staging project,
  // after the existing server-owned payment status has been established.
  const stagingStripe =
    isStagingEnrollmentRuntime(environment) &&
    proposal.stripeLivemode === false &&
    /^cs_test_[A-Za-z0-9_]+$/.test(checkoutSessionId);

  return status === "PAID" &&
    paymentStatus === "paid" &&
    Boolean(proposal.paidAt) &&
    (recordedCash || liveStripe || stagingStripe);
}

export function enrollmentIntakeBaseUrl(
  environment: Record<string, string | undefined> = process.env
): string {
  const project = environment.GCLOUD_PROJECT ||
    environment.GCP_PROJECT ||
    environment.GOOGLE_CLOUD_PROJECT;
  if (project === STAGING_PROJECT_ID) {
    if (!isStagingEnrollmentRuntime(environment)) {
      throw new Error("Staging intake URL requires verified staging runtime.");
    }
    return "https://sandman-combat-staging.web.app";
  }
  return "https://sandmancombat.com";
}
