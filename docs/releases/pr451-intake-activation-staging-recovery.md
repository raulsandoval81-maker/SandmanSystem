# PR451 staging Intake and Activation recovery

Application source remains pinned to `b3f93005d4bcd9547cb6415627e8133f0318ad74`.
The unchanged manifest allows exactly 16 staging Functions in `sandman-combat-staging`,
`us-central1`. Billing Functions, application code, Hosting, Firestore rules/indexes,
and production are outside this release.

## Three separate gates

1. After review and merge, separately approve `action=validate` on protected `main`
   with `confirm_project=sandman-combat-staging`. This is a creation preflight,
   not an installation certificate. Existing targets must match the full reviewed
   source-label, generation, runtime, identity, resources, staging markers, secret-key
   and trigger contract. Unexpected callable IAM fails closed. Missing Functions and
   missing invocation configuration are allowed only as explicit pending work.
2. Separately approve `action=bootstrap` with the existing
   `APPROVE_16_STAGING_INTAKE_ACTIVATION_FUNCTIONS` and
   `RESEND_STAGING_SECRET_ACCESS_VERIFIED` confirmations. It creates only verified
   absent Functions. Matching existing Functions are never redeployed. Creation
   performs no invocation-security updates, including for Gen1. The receipt always
   says `installationComplete: false` and names pending administrator configuration.
3. After the administrator work below, separately approve the read-only
   `action=verify-installation`. It captures fresh descriptions and IAM evidence and
   requires every one of the 16 Functions, every Firestore trigger, and every callable
   invocation setting to pass. Missing/unreadable evidence, drift, or pending access
   fails the action. Only this gate may report `installationComplete: true`.

All actions retain the protected staging environment, immutable application SHA,
existing workload identity provider, isolated source artifact, and exact allowlist.
Successful creation alone is not permission to run acceptance tests or release to production.

## Why invocation configuration is administrator-only

Run #9 (`41720087064`) failed on `createproposaldraft`; run #10 (`41726159310`)
failed on `updateproposaldraft`. The live role contained only
`run.services.setIamPolicy`, but its project condition required resource attributes
that the failing Cloud Run check did not supply. The condition's text and expiry
were not proof of effective authorization. Creation preflight therefore no longer
requires or certifies that temporary invoker role. Do not broaden it or renew it as
the proposed fix. No IAM binding is changed by this tooling.

## Exact administrator configuration procedure — separate approval required

Use `raulsandoval81@gmail.com` or another separately approved administrator, not an
elevated deployment service account. Before each change, verify the live Function is
ACTIVE at the pinned source and release labels and passes the same complete manifest
contract. Verify the deployed authorization guards: Firebase sign-in/active staff and
location scope for privileged staff operations; valid unexpired enrollment/invite
tokens for the family handoff. Stop on drift or missing guards.

Capture complete Function and service descriptions, service/function IAM policies,
revision, source generation, runtime/build identities, ingress, environment and secret
bindings as the baseline. Inspect the live invocation state and skip completed targets.

The seven approved Gen2 callable services are:

```text
createproposaldraft
updateproposaldraft
issueproposalenrollmenthandoff
approveintakecall
approveandactivate
hydrateenrollmentintakeprefill
supersedeenrollmentintakeinvites
```

Only after creation and separate approval, run the following for each confirmed
incomplete service from that list, replacing SERVICE with that exact name:

```bash
gcloud run services update SERVICE \
  --project=sandman-combat-staging --region=us-central1 \
  --no-invoker-iam-check --quiet
```

This permits HTTP requests to reach the callable handler; application authorization
remains mandatory. Gen2 Function and Cloud Run IAM must have no public bindings.
Do not add `allUsers` or `allAuthenticatedUsers` to Gen2 services as an alternative.
Do not recreate Functions, force a revision, or change deployment/runtime identities.

The three approved Gen1 callables retain the original reviewed transport model:

```text
getEnrollmentIntakeHandoffStatus
recordManualEnrollmentIntakeDelivery
sendEnrollmentIntakeEmail
```

For a confirmed missing Gen1 transport binding, separately authorize and execute:

```bash
gcloud functions add-iam-policy-binding FUNCTION \
  --project=sandman-combat-staging --region=us-central1 \
  --member=allUsers --role=roles/cloudfunctions.invoker --quiet
```

Replace FUNCTION with only the exact approved Gen1 name. The final verifier requires
exactly this Gen1 binding and rejects additional bindings. Gen1 uses this reviewed
binding instead of the Gen2 invoker-check setting. The six Firestore-triggered
Functions must never receive this public-access configuration.

Read back and compare the complete baseline after each change. Function source,
revision, identities, environment, secrets, ingress, and unrelated IAM must remain
unchanged. Cloud Run administrative generation/etag/time/modifier/status metadata
may change; record all differences. Run `verify-installation` only after these checks.

At the last read-only inventory, `createproposaldraft` was already complete and
`updateproposaldraft` needed correction; the other 14 Functions were absent. These are
historical observations, not authorization to configure a service without a fresh check.

## Rollback and acceptance

Configuration rollback requires separate approval: use `--invoker-iam-check` on only
the changed Gen2 services. Restore the captured Gen1 policy/binding state only for
changed Gen1 Functions. Never restore a whole project policy or delete resources as
part of invocation rollback. Function deletion is a separate reviewed operation.

After final verification, obtain separate approval for synthetic cash/check and Stripe
test-mode acceptance through the browser handoff, Intake, actual activation, and audit
receipt. Do not use P-000019 or real family records. No payment or family communication
is authorized by this release-tooling change.
