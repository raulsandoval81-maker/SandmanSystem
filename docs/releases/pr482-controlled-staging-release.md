# PR482 controlled staging release preparation

## Readiness: BLOCKED pending live baseline certification

Application SHA: `f402c04ee27a5ca9309a422221c3556f6523588a`. This tooling does not alter the application or authorize deployment. The manifest intentionally has `baselineSha256: null`; source packaging and every deployment remain blocked until the complete live capture is inspected and pinned on this branch.

Google Cloud Console showed staging project `sandman-combat-staging` / `991554514268` and Cloud Shell reported active identity `raulsandoval81@gmail.com`. The read-only capture was attempted in `/home/raulsandoval81/sandman-pr482-preflight-f402c04`, but the Cloud Shell/browser connection became unresponsive. File existence, checksums, revisions, configuration, IAM, source generations and Hosting rollback version were NOT verified. Do not treat the attempted directory as completed evidence or substitute older PIF/PR451 baselines.

First inspect that existing directory after reconnecting. Preserve any completed files. Finish or recapture incomplete metadata read-only using the current capture helper; its authorization snapshot also includes deployed service-account policies, deployment-role definitions and the existing WIF provider. No IAM changes are part of this workflow.

## Exact approved scope

Seven existing Gen2 Functions, in order:

1. createProposalDraft
2. updateProposalDraft
3. issueProposalClientReview
4. acceptProposalClientReview
5. createProposalCheckout
6. recordProposalPrepaidCash
7. stripeBillingWebhook

Seven Hosting paths:

- /connect/admissions/calculator/index.html
- /connect/admissions/calculator/calculator.js
- /connect/admissions/calculator/payment-arrangement.js (new)
- /connect/proposals/review/review.js
- /connect/enrollment/enrollment.js
- /management/billing/billing.js
- /management/billing/paid-in-full-state.js

The existing /management/billing/prepaid-terms.js must match the pinned application's unchanged dependency. Full live Hosting inventory/config and staging isolation files are preserved. No broad Firebase deployment or original bootstrap is used.

## Packaging and rollback gates

The capture records complete Function/Cloud Run configurations, both IAM policies, immutable source generations and source ZIP SHA-256 checksums. Original archives remain untouched rollback artifacts. All seven must be ACTIVE Node 22 with staging identities and environment guards. Missing access, metadata or any unrecognized configuration stops preparation.

Each candidate starts with its own deployed source ZIP. Preserve its entrypoint (including Admin initialization and WIF credential isolation), dependency versions and every unrelated file. Overlay only the manifest's approved compiled entry/shared modules from the exact application SHA. Set package.json scripts.gcp-build to empty so Cloud Build cannot overwrite the compiled modules using preserved older TypeScript. No pricing/rate or application-policy changes are introduced by this tooling. Reject environment/credential files, traversal, symlinks, missing runtime imports, altered checksums, incomplete rollback sets, unknown exports or source drift.

The protected workflow compiles the pinned source only to construct these verified packages; it does not develop or rebuild application functionality. Local tooling tests do not require another application build.

Immediately before each update, compare the Function and authorization baseline. Deploy one named existing Function, preserving captured runtime/build identities and resource options; do not change IAM or invocation configuration. Verify ACTIVE/new revision, complete configuration, both IAM policies, deployed package contents and startup logs. Stop on the first failure; never automatically retry a deployment or roll back. Before Hosting, verify all seven live Functions against their post-update receipts and recheck authorization using the Functions principal. Hosting uses its separate existing identity, verifies baseline drift before the first Function update and again before publication, overlays the complete manifest, and compares published file bytes/config afterward.

## Approval procedure

1. Finish the read-only live capture and real package verification. Inspect all baseline and rollback evidence; pin its canonical baselineSha256 in pr482-release.json. Validate staging prerequisites getProposalEnrollment/saveProposalEnrollmentAgreement and Intake/activation against the approved V2 evidence; ACTIVE alone does not certify their implementation. These prerequisite versions remain unverified in this preparation.
2. Re-run focused tooling tests and review the complete release-tooling PR. Merge requires separate explicit approval.
3. On main, select existing WIF-allowlisted workflow paid-in-full-v2-readonly-preflight.yml, release_scope=payment-arrangements, action=validate, confirm_project=sandman-combat-staging. Approve existing protected staging environment checks. Validate must pass with complete same-run artifacts before deployment is eligible.
4. Request separate deployment approval identifying the reviewed tooling commit, exact application SHA, seven Functions, seven paths, baseline digest and rollback references. Only then dispatch action=deploy with the same scope/project and approve_release=APPROVE_PR482_STAGING_SEVEN_FUNCTIONS_SEVEN_ASSETS. The default remains validate. The older scopes are unchanged.
5. Preserve pr482-verified-preflight and pr482-release-receipt artifacts. On partial failure, stop and inspect actual state; do not rerun blindly against a changed baseline. Automatic rollback is prohibited. Separately approved rollback uses the preserved per-Function archive/config or republishing the captured Hosting version, independently.

No release workflow was triggered in preparing this PR. Do not approve deployment while the baseline pin is null, permissions are unverified or real source packages have not passed packaging checks.

## Acceptance after an approved release

Follow prospect-builder-payment-arrangements.md using new authorized synthetic cases. Validate all three arrangements, six/twelve-month eligibility, partial/full/excluded fees, genuine synthetic family confirmation, verified online webhook or check reconciliation, duplicate rejection, no automatic billing during coverage, Intake, real activation callable, household identity and Coach roster. Existing P-000001/P-000002, Emmett, production and real payment records remain untouched. Release verification does not itself authorize these acceptance mutations.
