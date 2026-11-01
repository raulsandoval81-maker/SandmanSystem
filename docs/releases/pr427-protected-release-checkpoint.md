# PR #427 — protected release checkpoint

**Approved application commit:** `f3650ca4007448086d5a674df5784bbb3cdb9f54` (squash merge of #427).
**Target scope:** Firebase callable `correctP000019HistoricalAllocation`, and the four Hosting assets:
- `public/management/billing/billing.js`
- `public/connect/proposals/proposals.js`
- `public/management/enrollment-flow/enrollment-flow.js`
- `public/management/shared/services/historical-payment-summary.js`

## Source-only preflight
The accompanying workflow checks the pinned SHA, authorization/ledger code markers, and runs existing correction/Management tests. It uses **no GCP authentication**, has **read-only GitHub permissions**, and cannot deploy. A successful result does **not** certify staging, production, Firestore source data, IAM, or Stripe readiness.

## Staging verification still required
1. Verify the exact project's deployed revision, runtime identity, IAM and invoker policy with read-only cloud access.
2. Verify the approved mechanism can create/deploy **only** `correctP000019HistoricalAllocation` without redeploying unrelated Functions; no existing pinned billing release manifest authorizes this function.
3. Require a separate review and approval for staging deployment. Verify authenticated callable behavior with synthetic test data, idempotency refusal, and audit before/after evidence.
4. Do not invoke the production correction with real data until release and ledger preconditions are independently validated.

## Production verification still required
1. Read the current Hosting release/version and produce a **four-file-only** overlay preflight preserving every unrelated file. The prior PR425 workflow handles only one different, pinned Billing JS file; it is not appropriate.
2. Verify production Cloud Functions deployment permission and exact `us-central1` target; do not change IAM, invoker access or Stripe secrets.
3. Preserve production environment reviewer approvals, immutable source SHA, expected current Hosting release/version, no-unrelated-function-change contract, and independent staging acceptance.
4. Require separate user authorization for actual production deployment.

## Post-deployment checks and business blockers
The live proposal P-000019 correction must see exactly two existing $100 cash receipts; September is $100 MTM, October is $80 membership + $20 annual enrollment, leaving $10 of the $30 fee. Re-read current Firestore state immediately before any approved transaction. A historical correction is **not** the same as new payment capture.

The current checkout path also blocks because saved `pricing.membershipStartDate` reportedly starts in **October** whereas historical cash covers **September**, and `pricing.firstRecurringChargeDate` was blank. These are separate blockers. Do not authorize November autopay or checkout until the correct contractual dates, signed snapshot, and no-duplicate-charge schedule are verified.

## Security and dependency caution
The user's local `npm ci` output reported 28 package vulnerabilities, including 4 critical. Inventory and assess reachable runtime packages before production; do not apply `npm audit fix --force` as an unreviewed release change.
