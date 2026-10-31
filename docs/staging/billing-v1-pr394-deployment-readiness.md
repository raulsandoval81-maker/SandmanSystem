# Billing V1 — exact-SHA Stripe staging deployment readiness

**Immutable application:** PR #394 merge SHA `7befb7f2dba6debb0e32c9336cda99ad897712de`
**Isolated project:** `sandman-combat-staging`
**Status:** NOT YET APPROVED TO DEPLOY. PR #395/#396 established a validation-only checkpoint. Run #189 passed all 39 Billing tests but an inherited Coach source assertion blocked the overall run; that routing issue was corrected in #396.

## Scope and dependencies

The deployed flow must include **all** of these exports from the same immutable source:

- `recordProposalPriorPayment` — Management's historical payment entries.
- `recordHistoricalCashDisposition` — required decision for held cash.
- `issueProposalClientReview` — sends the updated family agreement. Needs `RESEND_API_KEY`.
- `getProposalClientReview` — family review and disclosure.
- `acceptProposalClientReview` — locks family acceptance to reconciled terms.
- `createProposalCheckout` — creates Stripe test-mode Checkout. Needs `STRIPE_SECRET_KEY`.
- `stripeBillingWebhook` — verifies Stripe-signed payment events and creates the future subscription. Needs **both** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

The Hosting overlay must include **at minimum** `public/management/billing/billing.js` and `public/connect/proposals/review/review.js`, along with their compatible HTML/JS dependencies. The existing release helper for PR #376 exports only the older four callables and deliberately removes the webhook secret registration; **reusing that package is not acceptable**. Other proposal functions required to create/approve/issue a real proposal may already exist in staging but must be checked, not assumed.

## Required cloud evidence before enabling a deployment release

1. **Read-only** inventory of each existing or absent Gen 2 callable, entry point, runtime identity, invoker configuration, region, source revision, and IAM. New functions require separate bootstrap approval. Fail closed on unknown or partial state.
2. **Test-mode secrets only:** inspect *metadata* and secret access policies for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `RESEND_API_KEY`. Verify that the webhook secret corresponds to a webhook endpoint in the **staging** Stripe account/test mode. Do not print or copy secret values into GitHub logs.
3. Pin all function names to the immutable application SHA and precise source/file allowlist; deploy the validated artifact using the dedicated staging deployer/build/runtime identities. No production project aliases, default environment, shared production webhook endpoint or broad role grants.
4. Verify the correct Hosting baseline and HTML/JS dependencies; do not publish the entire newer application tree merely to expose the Billing pages.
5. Keep independent approvals for callable bootstrap, deploy, and **synthetic** test-mode Stripe payment. A deployment approval alone is not authorization to process payments.
6. Capture pre-deployment configuration, Hosting release and source revision for rollback. Verify post-release identity, configuration and IAM unchanged apart from explicitly approved source changes.

## Acceptance scenario (synthetic only)

- $80/month membership; $30 annual enrollment, $20 previously paid.
- Two past membership periods (September and October) fully covered at $80 each.
- $20 excess cash explicitly **held**, not silently credited or refunded.
- Family's signed agreement shows exactly **$10 now**; **$80 recurring on November 5, 2026** (only while that date is future).
- After approved test-mode payment: confirm exactly one $10 Checkout capture, correct Stripe event signature and amount, exactly one future subscription, November 5 anchor, no duplicate charges for covered months, and no application of held $20.
- Repeat webhook deliveries and stale signatures must fail safely or remain idempotent. No live customer records or production money.

## Current blocker / decision

Cloud inventory and Stripe test endpoint/secret correspondence **have not yet been verified** in this preparation. Do **not** change the existing `billing-pr394-7befb7f2` validation-only release into a deployable one, or remove its no-deploy guard. The reviewed deployment contract in `scripts/staging/billing-v1-pr394-deployment-contract.mjs` is preparatory evidence, not a cloud authorization.

## Read-only staging evidence supplied October 30, 2026

Owner-provided `gcloud functions list --project=sandman-combat-staging --regions=us-central1` shows **18 active Gen 2 Cloud Functions**, of which only `recordProposalPriorPayment` is among the seven mandatory historical-cash payment-flow endpoints. The other six required endpoints are absent from the list. This is existence evidence only, not a guarantee of correct existing source or IAM configuration.

Owner-provided `gcloud secrets describe` shows:
- `STRIPE_SECRET_KEY`: exists and has labels `environment=staging`, `stripe_mode=test`. Labels do **not** establish that the stored key value is actually a Stripe test key.
- `STRIPE_WEBHOOK_SECRET`: `NOT_FOUND` in staging.
- `RESEND_API_KEY`: `NOT_FOUND` in staging.

Run the read-only command below after these observations to refresh metadata. Missing/unreadable secrets remain fail-closed; this script does **not** fetch secret values or deploy. Treat its summary as diagnostic evidence, not permission to create cloud resources.

```bash
node scripts/staging/billing-v1-pr394-readonly-preflight.mjs
```

The immediate next infrastructure work is to establish a staging-only Stripe test-mode webhook and verified signing-secret association, establish an approved non-production email delivery configuration, and explicitly approve the six missing functions' bootstrap after independent IAM/permission checks. Keep the prior validation-only release and production infrastructure unchanged.
