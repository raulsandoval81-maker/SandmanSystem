# PR #451 controlled staging release

This release is pinned to merged application commit `88c80ff1ceebbcf281e209559c2c2a2a84ffa7db` and targets only `sandman-combat-staging`.

## Scope

- Update existing `recordProposalPrepaidCash`, preserving its Compute runtime identity and no secrets.
- Update existing `createProposalCheckout`, preserving the Billing runtime and the staging `STRIPE_SECRET_KEY` binding.
- Separately bootstrap `getProposalEnrollment` and `saveProposalEnrollmentAgreement` on the Billing runtime with no secrets.
- Overlay only `public/connect/enrollment/enrollment.js` and `public/management/billing/billing.js` onto the complete live staging Hosting version.

Shared policy modules are compiled into the four function artifacts. No Firestore/Storage rules, webhook, Intake/activation callable, IAM policy, production resource, or data mutation is in release scope.

## Approval sequence

1. Merge this release-tooling PR after review. Do not dispatch from the PR branch.
2. From `main`, run `PR451 paid-in-full controlled staging release` with `action=validate` and `confirm_project=sandman-combat-staging`. A protected `staging` environment reviewer approves the read-only run.
3. Review the artifact. Confirm both existing function revisions/source generations, exact runtime identities, only the test Stripe secret on Checkout, two absent new callables, and the captured Hosting release/version.
4. Verify separately that the protected Functions deployer has create/update/get/source-set permissions, can act as the Billing and build identities, and that the build identity has its existing staging Artifact Registry, logging, and source-bucket permissions. No IAM grant is made by this workflow.
5. Run `action=bootstrap-new-callables`, enter `APPROVE_TWO_NEW_PR451_STAGING_CALLABLES`, and obtain a new protected-environment approval. This action refuses to overwrite an existing callable and creates only the two missing callables.
6. Run `action=validate` again. Review the new revisions and confirm both callables are Active on the Billing runtime with no secrets.
7. Run `action=deploy`, enter `APPROVE_PR451_STAGING_RELEASE`, `STRIPE_TEST_KEY_VERIFIED`, and the exact Hosting release/version from the latest validation artifact. Obtain a separate protected-environment approval. The workflow refuses the release if any callable is absent or Hosting changed after validation. Functions update first; Hosting releases last.

## Rollback

The validation artifact is the rollback checkpoint. For each pre-existing function it records the prior source bucket/object/generation, revision, runtime, secret metadata, and IAM. Rollback requires a separate protected approval to redeploy those immutable prior sources with their recorded configuration. The two newly created callables require separately approved deletion only if rollback is necessary. Hosting rollback is a separately approved release of the exact `priorVersion` recorded in `evidence/hosting/before.json`. Never roll back by deploying current `main`, and never modify production.

## Acceptance after deployment

Use synthetic staging families only. Verify signed 12-month Review & Confirm; annual fee included, excluded, and partial allocation; management-authorized cash/check preparation, family confirmation, and recording; duplicate rejection; no Stripe checkout for fully prepaid membership; exact 12-month coverage and separate renewal approval; Management Enrollment through Intake and real `approveAndActivate`; athlete plus activation receipt creation; and a read-only confirmation that P-000019 production history was not touched.
