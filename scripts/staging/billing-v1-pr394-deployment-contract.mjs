// Read-only deployment inventory for immutable Billing V1 source PR #394.
// This is NOT a release authorization or a deploy command. Every entry must
// be provisioned and inspected in isolated staging before enabling checkout.
export const BILLING_V1_SOURCE_SHA = "7befb7f2dba6debb0e32c9336cda99ad897712de";
export const BILLING_V1_STAGING_PROJECT = "sandman-combat-staging";
export const BILLING_V1_REQUIRED_CALLABLES = Object.freeze([
  "recordProposalPriorPayment",
  "recordHistoricalCashDisposition",
  "issueProposalClientReview",
  "getProposalClientReview",
  "acceptProposalClientReview",
  "createProposalCheckout",
]);
export const BILLING_V1_REQUIRED_WEBHOOK = "stripeBillingWebhook";
export const BILLING_V1_SECRET_BINDINGS = Object.freeze({
  issueProposalClientReview: Object.freeze(["RESEND_API_KEY"]),
  createProposalCheckout: Object.freeze(["STRIPE_SECRET_KEY"]),
  stripeBillingWebhook: Object.freeze(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]),
});
export const BILLING_V1_MANAGEMENT_UI = Object.freeze([
  "public/management/billing/billing.js",
  "public/connect/proposals/review/review.js",
]);
export function validateBillingDeploymentContract({
  applicationSha, projectId, hostingFiles, functions, secrets, stripeMode,
  verifiedWebhookDestination, bootstrapApproved,
} = {}) {
  if (applicationSha !== BILLING_V1_SOURCE_SHA || projectId !== BILLING_V1_STAGING_PROJECT)
    throw Error("Billing deployment requires the immutable PR394 source in isolated staging.");
  if (stripeMode !== "test") throw Error("Stripe test mode must be independently verified.");
  if (verifiedWebhookDestination !== true)
    throw Error("Staging Stripe webhook signing secret and endpoint must be verified.");
  if (bootstrapApproved !== true)
    throw Error("New callable creation requires separate staging bootstrap approval.");
  const targets = new Set(functions || []);
  for (const name of [...BILLING_V1_REQUIRED_CALLABLES, BILLING_V1_REQUIRED_WEBHOOK]) {
    if (!targets.has(name)) throw Error(`Missing required Billing staging function: ${name}`);
  }
  for (const [name, required] of Object.entries(BILLING_V1_SECRET_BINDINGS)) {
    const supplied = new Set(secrets?.[name] || []);
    if (required.some(secret => !supplied.has(secret)) || supplied.size !== required.length)
      throw Error(`Wrong staging secret binding for ${name}`);
  }
  const hosting = new Set(hostingFiles || []);
  for (const file of BILLING_V1_MANAGEMENT_UI) {
    if (!hosting.has(file)) throw Error(`Missing Billing staging Hosting overlay: ${file}`);
  }
  return true;
}
