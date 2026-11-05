# PR482 controlled staging release preparation

## Readiness: metadata-only baseline repair prepared; protected validation pending

Application SHA: `f402c04ee27a5ca9309a422221c3556f6523588a`.

Pinned canonical baseline SHA-256:

```text
2065f153a3ce0353f52ff945d19be99e74470e3478073212b6b58ec8e2987a77
```

This supersedes pre-repair digest `bdef7827792b8ad81d5168f002b594c19f60e45811b359fa97975dfc9e8af049`. Only the two service-account IAM policy snapshots changed within the baseline, matching the explicitly approved repair; all other baseline fields matched exactly. The new provider-reader role and pool binding were independently read back against their approved execution receipts and preserved as supplemental authorization evidence.

Certification completed November 5, 2026 at:

```text
/home/raulsandoval81/sandman-pr482-preflight-f402c04/certified-after-iam-20261105
```

Original evidence, packages and rollback archives remain untouched. Files in the new certification include baseline.json, receipt.json, rollback.json, seven original ZIPs, approved-iam-evidence.json, artifact-checksums.json and verification.json.

### Run #13 mismatch and exact correction

Diagnostic artifact `pr482-baseline-mismatch-42066210471` (ID `13433263806`) was downloaded from GitHub and matched the existing evidence ZIP byte-for-byte (SHA-256 `3a89134a05de9b27b334d14f1b55d5b33d62e52f6586f67cd4a1e07aae2d1b2d`). The preserved certified JSON's original raw digest still verifies as `5308ba86745de9cd4dd4f35fc0150c0b9a2a64a7e1ed8c7fa915be4cc29aabbb`; the run observed raw digest `5d1e86f13ab364d479bff7d037ce52742a56fd09f0afe724db060f3f7c7a3cb3`.

Exactly five observable fingerprint paths differ:

- `/hosting/release/releaseUser/imageUrl`
- `/hosting/release/version/createUser/imageUrl`
- `/hosting/release/version/finalizeUser/imageUrl`
- `/hosting/version/createUser/imageUrl`
- `/hosting/version/finalizeUser/imageUrl`

These are profile-avatar presentation URLs. The other 4,916 diagnostic fingerprints match, including asset hashes, release/version identifiers, configuration and non-redacted security metadata. Fingerprint diagnostics intentionally omit sensitive values; this does not exclude those values from the baseline digest.

The shared canonicalization removes only string-valued imageUrl fields at these five exact paths. Unknown fields/types, user emails, release/version names and times, Hosting config/assets, Function configuration/revisions, environment/secret fields, IAM and source pins remain covered. Generic digest() is unchanged. Capture receipts, mismatch diagnostics, package/deployment/aggregate pin guards and both live Hosting comparisons use the same canonicalization, so volatile avatars cannot trigger a later false drift check.

The replacement canonical pin above was calculated from the preserved certified JSON using the reviewed projection, never copied from the observed raw digest. Original certified files, rollback archives and packages were not changed or rebuilt. The comparison/projection proof is preserved in `baseline-diff-run13/canonicalization-proof.json` beside the existing Cloud Shell checkpoint. No IAM changes or additional workflow runs were performed.

Focused validation: 24 Python tests pass, including avatar rotation, input immutability, identity/configuration/asset/IAM/environment changes remaining blocked, unexpected avatar types remaining pinned, safe diagnostics and read-only Hosting verification. Python compilation and whitespace checks pass. No application or Function-package build was run. This repair requires separate review/merge approval and a later separately authorized protected validation; it does not authorize deployment.

### Verified results

- All seven preserved Function package trees match their complete per-file SHA-256 inventories and approved-only change lists. Compiled overlay modules match the already-built approved source. Dependencies, entrypoints and unrelated files remain preserved. No package was rebuilt.
- All seven rollback ZIPs match recorded sizes, SHA-256 checksums and immutable source generations; ZIP integrity passed.
- Hosting baseline: 3,068 files, release `sites/sandman-combat-staging/releases/1793824971815000`, rollback version `sites/sandman-combat-staging/versions/61b298b553d900ab`. Full manifest/configuration and existing seven-path overlay checksums match. The unchanged prepaid-terms.js dependency matches.
- Fresh reads of all seven Function/Cloud Run configurations and both invocation IAM policies match the preserved baseline. No deployment, runtime, secret-binding, invocation or unexpected IAM drift was found.
- Current authorization matches the approved account-policy repair exactly. Pool policy, the new single-permission provider-reader role and the reused single-permission account-reader role match the approved receipts.
- Protected [run #11, attempt 2](https://github.com/raulsandoval81-maker/SandmanSystem/actions/runs/41990235298) succeeded: all 6/6 WIF-deployer resource reads passed, and their response hashes match the certified evidence. Job `127323542906`; artifact `13427375750`. All deployment jobs were skipped.
- Focused release-tooling validation: 18 Python tests and 8 Node 22 workflow tests passed; the pin matches the canonical baseline digest and receipt. No unrelated tests or tooling changes were added.

Preserved candidate receipts retain their original baseline provenance and candidateOnly marker. They are not deployment authorization. The existing protected validation must prepare and verify its own normal release evidence before any separately approved deployment.

After this pin PR is separately approved and merged, run only:

```sh
gh workflow run paid-in-full-v2-readonly-preflight.yml \
  --repo raulsandoval81-maker/SandmanSystem --ref main \
  -f action=validate -f release_scope=payment-arrangements \
  -f confirm_project=sandman-combat-staging
```

Do not dispatch from the task branch or change WIF restrictions. Approve the existing protected staging environment for validation. No deployment, merge, cloud mutation, production operation or payment activity is authorized by this certification.

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

1. Baseline certification and the pin are complete. Do not repeat the manual capture or rebuild preserved packages. After separate merge approval, run the protected payment-arrangements validation below. Enrollment/Intake/activation prerequisite versions and synthetic acceptance remain separate gates; this pin does not certify their business behavior.
2. Re-run focused tooling tests and review the complete release-tooling PR. Merge requires separate explicit approval.
3. On main, select existing WIF-allowlisted workflow paid-in-full-v2-readonly-preflight.yml, release_scope=payment-arrangements, action=validate, confirm_project=sandman-combat-staging. Approve existing protected staging environment checks. Validate must pass with complete same-run artifacts before deployment is eligible.
4. Request separate deployment approval identifying the reviewed tooling commit, exact application SHA, seven Functions, seven paths, baseline digest and rollback references. Only then dispatch action=deploy with the same scope/project and approve_release=APPROVE_PR482_STAGING_SEVEN_FUNCTIONS_SEVEN_ASSETS. The default remains validate. The older scopes are unchanged.
5. Preserve pr482-verified-preflight and pr482-release-receipt artifacts. On partial failure, stop and inspect actual state; do not rerun blindly against a changed baseline. Automatic rollback is prohibited. Separately approved rollback uses the preserved per-Function archive/config or republishing the captured Hosting version, independently.

Only authorization-only run #11 attempt 2 was rerun and passed. No deployment was triggered. This pin does not authorize deployment: payment-arrangements validation must pass before separate exact-scope deployment approval.

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

Complete configuration/source generations, original archive sizes and SHA-256 values remain in the original baseline.json, rollback.json and receipt.json. The pre-repair authorization snapshot remains in certified-complete/baseline.json; the current certified baseline is in certified-after-iam-20261105/baseline.json. Candidate inventories and approved-only change lists remain in candidate-complete; original archives were copied without modification. verified-summary-complete.json records configuration, package-inventory and Hosting-manifest digests without exposing credential or secret values.
