# Prospect Builder payment arrangements

Application integration only. No release, IAM change, Stripe request or staging record mutation is authorized by this PR.

## One enrollment engine

`pricing.paymentArrangement` is independent of athlete billing commitment and membership start. Missing values retain legacy monthly behavior. The proposal callable validates prepaid eligibility and canonicalizes terms using existing V2 coverage/fee validators. The arrangement, term totals, per-athlete fee allocation, paid-through date and earliest renewal date are frozen in the family snapshot and carried by the existing authoritative proposal link through Intake and activation.

| Arrangement | Collection | Evidence permitting Intake |
| --- | --- | --- |
| monthly_autopay | Existing Stripe flow, unchanged | Existing verified payment gate |
| prepaid_stripe | One Checkout Session, mode=payment; no subscription/setup authorization | Signature-verified paid Stripe event, exact pending Session/amount/currency/signed snapshot |
| prepaid_cash_check | No Stripe Checkout; prepare reconciliation at proposal acceptance | Existing V2 staff/location-authorized payment recording after Review & Confirm |

Prepaid supports homogeneous six- or twelve-month Combat households. Mixed term/Fitness households, additional unpaid months, private extras and previously credited annual fees are rejected by the new Builder arrangement. Existing historical-payment and legacy V2 reconciliation routes are preserved. Do not silently convert those records through the new arrangement selector.

The annual fee is allocated per athlete before family review: full, partial or zero. Cash/check recording must match that signed allocation exactly and retains the actual original payment-date requirement. Remaining fee is recorded separately and does not trigger automatic collection. If allocation changes, obtain a corrected genuine family review.

The online receipt uses `prepaidPayment`; historical cash remains `cashPrepayment`. Billing displays either receipt. Intake and real activation continue reading the existing proposal payment gate; no new activation bypass exists. Existing online test-mode evidence is eligible only in verified staging. Online prepaid renewal setup is intentionally not offered through the cash-only renewal callable. No automatic renewal is authorized for either new arrangement.

## Duplicate and failure handling

A Firestore transaction claims the fingerprint of the immutable signed snapshot before Stripe Session creation. All concurrent/retried calls use one deterministic Stripe idempotency key. Existing open Sessions are reused. Existing paid, expired or uncertain Sessions block another charge. A claim without a saved Session older than 23 hours blocks recovery before Stripe idempotency retention can expire. Resolve uncertain/expired Sessions through a separately reviewed Management recovery; this PR does not implement automatic replacement.

The existing webhook verifies raw-body signatures before dispatch. Both completed and asynchronous-success events route prepaid payments independently of the monthly subscription handler. Unpaid completion cannot fulfill. A transaction verifies signed terms, Session, PaymentIntent, currency and exact amount, records the receipt and audit once, and rejects conflicting duplicates. Recorded online payment date is explicitly the verified-webhook confirmation time, not a claimed original check date.

## Validation

Node 22 Functions TypeScript build. New executable policy/Checkout/webhook/preview tests cover six/twelve-month totals, partial/full/excluded fees, invalid eligibility/dates, concurrent requests, interrupted requests, expired claims/Sessions, exact evidence, duplicate fulfillment, staging-only Intake eligibility and monthly compatibility. Run `npm --prefix functions run test:payment-arrangements`; the normal Functions test command also includes the new suite and preview tests. See PR for actual run counts.

Tests use in-memory Firestore/Stripe doubles; they do not certify live Stripe delivery, browser signatures, actual Intake/activation or Coach roster. Those remain staging acceptance gates. No emulator or staging E2E result is implied.

## Controlled staging release prerequisites — separate approval

Review and approve this PR; merge only after explicit approval. Pin the merged application SHA and build it under Node 22. Prepare a new narrow release manifest before requesting staging deployment approval. Do not reuse an older PIF release allowlist automatically.

Affected callable deployments: createProposalDraft, updateProposalDraft, issueProposalClientReview, acceptProposalClientReview, createProposalCheckout, recordProposalPrepaidCash, stripeBillingWebhook. Preserve existing configuration, runtime/build identities, invocation settings, secrets and rollback archives; verify transitive module packaging includes the new modules. Existing getProposalEnrollment/saveProposalEnrollmentAgreement and Intake/activation Functions must already match the approved V2 prerequisites; no changes are required here.

Hosting paths: /connect/admissions/calculator/index.html, /connect/admissions/calculator/calculator.js, /connect/admissions/calculator/payment-arrangement.js (new), /connect/proposals/review/review.js, /connect/enrollment/enrollment.js, /management/billing/billing.js, /management/billing/paid-in-full-state.js. Existing /management/billing/prepaid-terms.js is a required unchanged dependency. Use a complete live-manifest overlay, preserve other assets/config and capture independent Function/Hosting rollbacks. Stop if packaging or baseline preservation cannot be verified.

## Synthetic acceptance after separate release authorization

1. Leave P-000001, P-000002 and every real record unchanged. Create isolated synthetic cases only after test authorization, with non-deliverable contacts and no remote delivery.
2. Verify all three arrangement choices remain separate from billing commitment/start and reload correctly. Reject monthly, mixed commitments and unsupported membership combinations for prepaid.
3. For cash/check six- and twelve-month cases, select partial/full/zero annual fees; genuinely perform synthetic family proposal acceptance and Review & Confirm. Confirm no Checkout is created and no payment is recorded before reconciliation. Record one simulated check with its explicit original date. Reject duplicates and altered signed allocation/coverage.
4. For online six- and twelve-month cases, verify current Stripe test-mode configuration, then use test Checkout only. Confirm mode=payment and no subscription. Verify unpaid completion does not fulfill, successful signed webhook records exact coverage once, replay causes no second payment/audit, and mismatches reject. Do not test with live keys or real payments.
5. Verify Billing receipts and separate annual-fee balance; Intake invitation/submission; Management approval and real activation callable; household association; athlete identity and Coach roster placement. Verify audit events and no duplicate activation or billing during coverage.
6. Monthly and Elias historical-cash regression: use isolated synthetic equivalents, never the real records. Confirm original amounts, fee recognition and signed recurring schedule are unchanged.

Emmett remains a separate production approval gate: Management must first confirm the deposited check amount/date, locked rate, membership dates and annual-fee allocation. This PR does not authorize his proposal, signature, reconciliation or activation.
