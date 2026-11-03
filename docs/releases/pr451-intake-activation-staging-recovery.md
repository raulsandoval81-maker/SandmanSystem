# PR #451 staging Intake and Activation recovery

The application source is pinned to `b3f93005d4bcd9547cb6415627e8133f0318ad74`. The release targets only `sandman-combat-staging` and creates exactly 16 currently absent Functions. It does not redeploy the four active billing/enrollment callables, Hosting, Firestore rules, indexes, or production.

## Exact scope

Ten callable endpoints: `createProposalDraft`, `updateProposalDraft`, `issueProposalEnrollmentHandoff`, `getEnrollmentIntakeHandoffStatus`, `recordManualEnrollmentIntakeDelivery`, `sendEnrollmentIntakeEmail`, `approveIntakeCall`, `approveAndActivate`, `hydrateEnrollmentIntakePrefill`, and `supersedeEnrollmentIntakeInvites`.

Six Firestore triggers: `recordEnrollmentIntakeInvite`, `recordEnrollmentIntakeSubmitted`, `recordEnrollmentAthleteActivated`, `consumeSubmittedIntakeToken`, `syncActivatedAdultContact`, and `syncActivatedEnrollmentPlacement`.

The three legacy callable definitions remain Gen 1. All other Functions remain Gen 2. The two email Functions use the existing staging Billing runtime because it is the only runtime already authorized for `RESEND_API_KEY`; all other identities mirror the production generation model using staging Compute/App Engine identities. No secret value is read.

## Approval procedure

1. Merge this tooling PR after review. Do not run the workflow from the PR branch.
2. Dispatch `PR451 Intake and Activation staging recovery` from `main` with `action=validate` and `confirm_project=sandman-combat-staging`. Approve the protected `staging` environment.
3. Review the artifact: all 16 targets must be absent or exact completed artifacts from this release; the four existing billing/enrollment prerequisites must remain Active; Firestore must be `(default)` in `nam5`; `RESEND_API_KEY` metadata must exist with only the Billing runtime accessor; and the deployer roles must match the checked contract.
4. Separately dispatch `action=bootstrap` with `APPROVE_16_STAGING_INTAKE_ACTIVATION_FUNCTIONS` and `RESEND_STAGING_SECRET_ACCESS_VERIFIED`. Obtain a new protected-environment approval.
5. The bootstrap uses the immutable source, excludes repository `.env`, creates only allowlisted targets, and skips only an already Active target carrying the exact source-SHA label. Any unrelated existing function fails closed.
6. Run `action=validate` again and verify every generation, runtime, trigger, secret attachment, and source label before synthetic acceptance testing.

## Invocation-IAM prerequisite and partial resume

Run `41704136270` created `createProposalDraft` at the pinned source SHA, then stopped before enabling callable transport because the existing `sandmanBillingInvokerIamRelease` binding had expired. The bootstrap now validates every existing Function's source label, generation, Node runtime, entry point, build identity, runtime identity, resources, environment markers, secrets, and trigger before resuming. A matching callable completes and re-verifies its invocation configuration before the loop may continue; any drift or permission failure stops the release.

The custom role contains only `run.services.setIamPolicy`. Its smallest pre-creation scope is a short-lived conditional project binding restricted to the seven Gen 2 callable Cloud Run resource names below. Per-service bindings would be narrower after creation, but cannot authorize configuration of services that do not exist yet.

- `projects/sandman-combat-staging/locations/us-central1/services/createproposaldraft`
- `projects/sandman-combat-staging/locations/us-central1/services/updateproposaldraft`
- `projects/sandman-combat-staging/locations/us-central1/services/issueproposalenrollmenthandoff`
- `projects/sandman-combat-staging/locations/us-central1/services/approveintakecall`
- `projects/sandman-combat-staging/locations/us-central1/services/approveandactivate`
- `projects/sandman-combat-staging/locations/us-central1/services/hydrateenrollmentintakeprefill`
- `projects/sandman-combat-staging/locations/us-central1/services/supersedeenrollmentintakeinvites`

The binding condition must require `resource.type == "run.googleapis.com/Service"`, an exact `resource.name` membership in that list, and a separately reviewed near-term expiration. The read-only validation rejects an absent, expired, broader, or differently scoped condition. IAM modification remains outside this release workflow and requires separate approval; remove the temporary binding after acceptance.

## Rollback

These are new staging Functions, so rollback is a separately approved deletion of only the exact 16 names after retaining the bootstrap receipt and final descriptions. If bootstrap stops partially, rerun only after the validation artifact proves every existing target is an Active exact-SHA artifact; otherwise stop for review. No prior function revision exists to restore. Rules, indexes, Hosting, billing Functions, Stripe configuration, and production remain unchanged.

After deployment, use synthetic staging records only to test cash/check Paid-in-Full and Stripe test payments through handoff, intake submission, real `approveAndActivate`, athlete creation, and activation audit receipt. Never use P-000019 or other real family data.
