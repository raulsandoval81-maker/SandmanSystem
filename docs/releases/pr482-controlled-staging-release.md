# PR482 controlled staging release preparation

## Readiness: BLOCKED on protected-principal read verification

Application SHA: `f402c04ee27a5ca9309a422221c3556f6523588a`. This tooling does not alter the application or authorize deployment. The manifest intentionally retains `baselineSha256: null`; protected packaging and deployment remain blocked until the authorization-read gate below is resolved.

Recovered checkpoint: `/home/raulsandoval81/sandman-pr482-preflight-f402c04` (original files preserved).

Read-only recovery verified all seven immutable rollback ZIPs against their recorded size, SHA-256, source generation and ZIP integrity. Original baseline digest: `d1a0659182aed5cadf4d035b9e9bdb19927919bf371842aa881a803ea84eef42`. A fresh complete read of all seven Functions, Cloud Run configurations, both IAM policies, Hosting and previously captured authorization settings matched exactly: zero drift.

Hosting release `sites/sandman-combat-staging/releases/1793824971815000`, rollback version `sites/sandman-combat-staging/versions/61b298b553d900ab`, complete manifest: 3,068 files. The required unchanged prepaid-terms.js dependency matches the approved application's compressed asset hash.

The original authorization snapshot did not contain role definitions or the two deployment-account impersonation policies. Current definitions and both impersonation policies were captured separately in `certified-complete/`; no historical comparison is claimed for those newly captured controls. Current complete evidence digest: `bdef7827792b8ad81d5168f002b594c19f60e45811b359fa97975dfc9e8af049`.

Real per-Function candidates passed rollback/source checks, approved-only module changes and transitive relative-import closure. All seven target exports loaded successfully under Node 22.23.4 with the preserved dependencies; candidate overlay bytes match the Node 22 build. The Hosting overlay changes exactly seven approved paths, preserving all other live hashes and configuration. Entrypoints and dependency files are preserved; all seven dependency locks match the approved application. Candidate-only preparation can use a verified receipt before final pinning, but writes `candidateOnly: true`; deployment rejects that receipt even after the baseline is pinned. No deployment credentials or cloud mutations are used by candidate preparation.

The role reader was corrected to query predefined roles globally and custom roles only in the staging project. The original reader incorrectly passed a project scope for predefined roles. Focused regression coverage verifies both scopes and rejects foreign-project roles.

## Remaining protected-principal access gate

The captured project role definitions for sandman-practice-deployer do not declare iam.serviceAccounts.getIamPolicy or iam.workloadIdentityPoolProviders.get. The capture requires both: service-account impersonation/runtime/build policies and the WIF provider are release authorization boundaries. Administrator read access succeeded; that does not establish the protected deployment principal's effective access. Direct impersonated read verification has not yet been certified. No role or IAM binding was modified, and no missing permission is inferred solely from the administrator's success.

Do not remove these fail-closed checks to get validation through. Preserve the candidate complete baseline and resolve/verify the read-only access path before pinning. Any access correction requires separate approval; this PR grants no permissions.

Validation: 14/14 Python tooling tests, 8/8 existing workflow tests under Node 22, Python compilation and whitespace checks pass. Cloud Shell Node 22.23.4 TypeScript build passes; 7/7 candidate startup/target-export checks pass. The first build attempt ran Node 24 because the shell's npx did not select Node 22; an explicit Node 22 build superseded it, and all overlay bytes matched. These checks make no callable invocation or network payment request.

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

## Preserved Function revisions

| Function | Verified revision |
| --- | --- |
| createProposalDraft | createproposaldraft-00001-des |
| updateProposalDraft | updateproposaldraft-00001-keh |
| issueProposalClientReview | issueproposalclientreview-00004-kul |
| acceptProposalClientReview | acceptproposalclientreview-00003-saf |
| createProposalCheckout | createproposalcheckout-00004-goz |
| recordProposalPrepaidCash | recordproposalprepaidcash-00007-kav |
| stripeBillingWebhook | stripebillingwebhook-00001-jax |

Complete configuration/source generations, original archive sizes and SHA-256 values remain in the original baseline.json, rollback.json and receipt.json. Current role definitions and deployment-account policies are in certified-complete/baseline.json. Candidate inventories and approved-only change lists remain in candidate-complete; original archives were copied without modification. verified-summary-complete.json records configuration, package-inventory and Hosting-manifest digests without exposing credential or secret values.
