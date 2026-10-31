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

## Read-only runtime discovery — existing prior-payment callable

Owner-provided `gcloud functions describe recordProposalPriorPayment --gen2 --region=us-central1 --project=sandman-combat-staging` reports:
- `state: ACTIVE`, `buildConfig.runtime: nodejs22`, `buildConfig.entryPoint: recordProposalPriorPayment`.
- `buildConfig.serviceAccount: sandman-practice-build@sandman-combat-staging.iam.gserviceaccount.com`.
- `serviceConfig.serviceAccountEmail: 991554514268-compute@developer.gserviceaccount.com` (default Compute identity, **not** a dedicated Billing runtime identity).
- `serviceConfig.ingressSettings: ALLOW_ALL` (network exposure; **does not** establish that unauthenticated invocation is allowed).

**Fail-closed follow-up:** inspect the Cloud Run service's IAM invoker policy and the current runtime account's actual granted permissions; do not assume public access merely from `ALLOW_ALL`. Compare with the protected release's dedicated approved runtime identity and bootstrap plan. Any runtime-identity migration or invoker change requires its own approval and pre/post-deployment configuration evidence; no IAM writes are authorized by this discovery.

## Read-only service-level Cloud Run IAM result

Owner-provided `gcloud run services get-iam-policy recordproposalpriorpayment --region=us-central1 --project=sandman-combat-staging --format=yaml` returned only `etag: ACAB`, with **no service-level bindings** visible. There is therefore no displayed service-level `allUsers` invoker grant. This does **not** by itself prove that invocation is authenticated: verify `run.googleapis.com/invoker-iam-disabled` and inherited policies/configuration before declaring the endpoint protected. Continue to preserve existing policy; do not add or remove invoker bindings on the strength of this output alone.

## Observed Cloud Run invoker setting and verified code-level access control

Owner-supplied Cloud Run metadata on `recordproposalpriorpayment` shows `run.googleapis.com/invoker-iam-disabled: 'true'`, alongside `run.googleapis.com/ingress: all` and `run.googleapis.com/urls`. Therefore the empty service-level IAM binding list does **not** demonstrate an IAM-protected invocation boundary: Cloud Run IAM invoker enforcement is explicitly disabled. This does not by itself prove unauthenticated application data access.

At immutable application source `7befb7f2dba6debb0e32c9336cda99ad897712de`, `functions/src/billing/recordProposalPriorPayment.ts` is a Firebase `onCall` function and explicitly rejects missing `req.auth` before reading/writing proposal data. It next invokes `requireProposalStaffAccess(req.auth.uid)`, which requires an active staff record with an allowed Management/Admin role, then `requireProposalLocationAccess` to restrict location access except authorized Admin roles. These are source-level findings, not deployed-artifact or external-invocation proof. Before changing invoker policy verify Firebase callable client transport requirements and perform an authorized anonymous-denial test; do not blindly enable Cloud Run IAM requirements and break Firebase clients.

No policy, IAM, secrets or deployment configuration was changed.

## Completion sequence — do not repeat prior source-only diagnostics

**Account boundary:** The currently connected Stripe account exposes **livemode only** to this assistant. Do not use it to configure staging or process a test payment. Staging test-mode configuration must be performed in the verified Stripe test environment by an authorized operator, without revealing keys or signing secrets in chat, logs or GitHub.

1. **Create the staging test-mode webhook registration** in Stripe Workbench/Dashboard, selecting test mode explicitly. Proposed HTTPS destination (verify Firebase regional endpoint before saving): `https://us-central1-sandman-combat-staging.cloudfunctions.net/stripeBillingWebhook`. Required event subscriptions must be derived exactly from `functions/src/billing/webhook.ts` before configuration; do not subscribe to a guessed or broad event set. Endpoint may not be live until its Cloud Function is created. Copy the signing secret only through a secured secret-provisioning procedure.
2. **Provision two missing staging-only secrets** `STRIPE_WEBHOOK_SECRET` and `RESEND_API_KEY` using an approved secure channel. The Resend key must be restricted to an approved testing email domain/inbox; never assume that a production Resend key is acceptable. Inspect existence, labels and authorized runtime access without retrieving/printing the payload. Confirm existing `STRIPE_SECRET_KEY` is test-mode without exposing its value.
3. **Finalize deployment bundle** from immutable PR #394 source: seven named functions including the existing `recordProposalPriorPayment`, six new bootstrap functions, exact staging Hosting overlay and all required function secrets. Preserve source/current function configuration and an explicit separately authorized bootstrap procedure. **Do not reuse** PR #376 four-function manifest or strip webhook secret registration. Validate with a new release ID; existing `billing-pr394-7befb7f2` stays validation-only.
4. **Protected staging deployment** only after explicit operator approval, successful preflight IAM / Cloud Run invoker checks and rollback evidence, under the dedicated staging deployment identity. Existing `recordProposalPriorPayment` has `run.googleapis.com/invoker-iam-disabled: true`; pinned source validates Firebase auth, active staff role and location, but runtime behavior must be verified without assuming that empty Cloud Run IAM bindings enforce access.
5. **Acceptance testing:** authorized synthetic family and Management accounts, no live customers; test anonymous rejection, complete historical-cash disposition, email/review/acceptance, Stripe test Checkout/webhook events, duplicate delivery handling, correct future recurring date and 1-time enrollment balance, with no accidental historical recharges.

**Stop condition:** Missing test-mode Stripe access, webhook signing secret, Resend test credentials or explicit bootstrap approval blocks end-to-end staging deployment. Passing read-only diagnostics is not approval to bypass those prerequisites.
