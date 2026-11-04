# Staging proposal correction repair

This release is limited to `sandman-combat-staging`, exact application source
`786dba9824663feea4aa092a1bbe54b151c8233a`, the missing Gen2 callable
`returnProposalToDraft`, and `/connect/proposals/proposal-safeguards.js`.
The manifest is intentionally non-authorizing. A protected staging approver must separately
authorize `APPROVE_STAGING_PROPOSAL_CORRECTION_ONE_FUNCTION_ONE_ASSET`.

## Protected workflow

Run [Protected controlled staging releases](https://github.com/raulsandoval81-maker/SandmanSystem/actions/workflows/paid-in-full-v2-readonly-preflight.yml)
from `main` with `release_scope=proposal-correction`, `confirm_project=sandman-combat-staging`,
and `action=validate`. Validation is read-only and records the verified missing Function,
security prerequisites, sibling callable configuration, and exact Hosting rollback baseline.

Only after a successful validation and separate staging-environment approval may an operator
choose `action=deploy` and enter
`APPROVE_STAGING_PROPOSAL_CORRECTION_ONE_FUNCTION_ONE_ASSET`. The workflow filename is already
allowed by the staging WIF provider; no new provider or identity binding is required.

The current read-only audit identifies two prerequisites that must be separately approved and
satisfied before validation can pass: the practice deployer needs narrowly scoped permission
to create this missing Function, and its `run.services.setIamPolicy` grant must be renewed with
an unexpired condition restricted only to the `returnproposaltodraft` Cloud Run service. The
workflow does not grant either permission and rejects unconditional, duplicate, expired, or
broader invocation access.

## Read-only preflight

1. Check out the exact application SHA in an isolated directory and verify Node 22.
2. Run `npm ci --prefix functions`, `npm run build --prefix functions`, and both
   `proposal-correction-*.test.mjs` files.
3. Confirm `gcloud functions describe returnProposalToDraft --gen2` returns verified
   `NOT_FOUND`. Any permission, authentication, transport, or other cloud error is a stop.
4. Confirm `issueProposalClientReview` remains ACTIVE with Node 22, billing runtime identity,
   practice build identity, `ALLOW_ALL`, and Cloud Run annotation
   `run.googleapis.com/invoker-iam-disabled=true`.
5. Run the Hosting helper in `verify` mode with a short-lived staging Hosting token. Retain
   `hosting-before.json`; its `rollbackVersion` is the exact Hosting rollback target.

## Separately approved deployment

Build a source artifact from the pinned checkout while excluding `.env`, `.env.*`, and all
nested variants. Deploy only `returnProposalToDraft` as Gen2/Node 22 with entry point
`returnProposalToDraft`, billing runtime service account, practice build service account,
256 MiB, 1 CPU, 60-second timeout, 20 maximum instances, concurrency 80, all ingress,
HTTP trigger, staging environment markers, `STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest`, and
release/source-SHA labels. Then set only the new service's established callable transport
configuration with `gcloud run services update returnproposaltodraft --no-invoker-iam-check`.

Before Hosting publication, require all of the following: Function ACTIVE; source and release
labels exact; Node 22; entry point, build identity, runtime identity, resources, environment,
and secret exact; empty Function and Run IAM bindings; and
`run.googleapis.com/invoker-iam-disabled=true`. Set
`PROPOSAL_CORRECTION_FUNCTION_VERIFIED=yes` only after those checks pass. Run the Hosting
helper in `deploy` mode with the explicit approval phrase. It reconstructs the current live
Hosting version and changes exactly one asset.

## Staging acceptance and rollback

Use a new synthetic proposal, not P-000001. Verify an unauthenticated callable request is
rejected by Firebase, an unauthorized staff account is rejected, and an authorized
same-location Management user can reopen REVIEW and AWAITING_CLIENT_SIGNATURE proposals.
Confirm the result is DRAFT, the old Review & Confirm token no longer works, the correction
reason appears in the history subcollection, and Prospect Builder loads the proposal. Force a
callable failure and confirm the button returns from `Reopening…` to `Correct Proposal` and is
enabled.

Function rollback is deletion because the verified pre-release state is NOT_FOUND:
`gcloud functions delete returnProposalToDraft --gen2 --region=us-central1
--project=sandman-combat-staging`. Hosting rollback publishes the exact `rollbackVersion`
recorded in `hosting-before.json`. Both are staging mutations requiring separate approval;
neither rollback is automatic.
