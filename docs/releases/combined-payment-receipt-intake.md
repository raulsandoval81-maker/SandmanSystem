# Combined payment receipt and Intake delivery

Design for review. No production or staging behavior changes.

## Payment authority

- Cash/Check: reuse the existing receipt callable's recorded prepaid allocation, coverage dates, and Stripe-link exclusion.
- Stripe: use the server-verified paid Checkout session and its actual amount and currency. Bind the session to the proposal, correct account/mode, and payment evidence. Preserve webhook and subscription behavior. Never use the return page, a browser amount, or the quoted amount as proof of payment.

## Delivery transaction

1. Authorize Management and location. Validate the confirmed recipient and staging allowlist.
2. Verify the paid proposal and resolve its canonical Intake audience. Reuse an unused, unexpired matching token. Fail on proposal, audience, location, or recipient mismatch. Generate a token only through the existing authorized handoff path when no usable token exists.
3. In a Firestore transaction, reserve a single attempt for the verified payment and the Intake token. Check the existing receipt and Intake records first. Existing accepted deliveries return their status without sending. An existing standalone receipt stays separate and is never resent to attach a link. A pending attempt blocks either sender.
4. Send one email with the verified receipt details and the secure Complete Enrollment link. Keep a distinct receipt audit record and an Intake delivery audit record correlated by attempt and provider acceptance ID. On acceptance, persist both records atomically and set the delivered link's 48-hour expiry. Preserve consumed-token state if the link was used before finalization.
5. On definite provider rejection, record the failure on both reservations. On transport exception, missing acceptance ID, or persistence failure, leave the attempt pending. Only an audited reconciliation against provider evidence may finalize it or permit a retry. Both standalone and combined send paths must honor the same reservation and reconciliation rules.

## Existing P-000002

Read the existing receipt, Intake token, and pending provider attempt. Match the provider record to the recipient and exact attempt. Resolve accepted or confirmed non-accepted through the existing audited control. Where acceptance cannot be proven, retain the pending lock. After confirmed non-acceptance, use standalone Intake recovery with the existing eligible token and no new receipt. Test the combined flow on a fresh synthetic fixture.

## Required test and release gates

- Cash/Check and Stripe: verified payment accepted, unpaid or mismatched payment rejected, receipt amount and link verified.
- Token: valid reuse, wrong recipient/proposal/audience rejected, expired or consumed token never silently reused.
- Delivery: repeat and concurrent calls send once; existing receipt stays unchanged; timeout and missing provider ID remain pending; confirmed rejection and audited recovery; acceptance followed by failed persistence.
- Use synthetic data and an approved mailbox in staging, with Stripe test mode only. Capture provider and both audit records and complete embedded waiver/Intake.
- Pin the implementation SHA and exact touched artifacts after review. Capture deployed Function source, configuration, transport/IAM and rollback hashes plus Hosting baseline and manifest if any Hosting asset changes. Require separate staging approval and fail on baseline drift. Production remains a separate release.
