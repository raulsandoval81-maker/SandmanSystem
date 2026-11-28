# Billing PR394 staging bootstrap — approval packet (NOT authorization)

Status: **BLOCKED — evidence gathering and separate written approval required**.

This packet captures confirmed staging observations and deliberately contains **no executable IAM mutations or deployment commands**. It is not permission to deploy, create identities, change Stripe webhook configuration, or merge an enabled release.

## Immutable target

- Release: `billing-pr394-deploy-7befb7f2`
- Application SHA: `7befb7f2dba6debb0e32c9336cda99ad897712de`
- Project: `sandman-combat-staging` (`991554514268`)
- Region: `us-central1`
- Deployer: `sandman-practice-deployer@sandman-combat-staging.iam.gserviceaccount.com`
- Build identity: `sandman-practice-build@sandman-combat-staging.iam.gserviceaccount.com`
- Intended runtime: `sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com`
- Protected code policy: `validationOnly: true`, with separate bootstrap approval required.

## Read-only observations, October 30, 2026 (user-provided CLI)

- `gcloud projects describe` returned project ID `sandman-combat-staging`, number `991554514268`.
- `gcloud iam service-accounts describe sandman-billing-runtime@...` returned `NOT_FOUND`. This alone does not prove anything about service-account creation permissions.
- `gcloud functions list --v2 --project=sandman-combat-staging --regions=us-central1` listed `recordProposalPriorPayment` as ACTIVE; none of the six new functions appeared.
- Focused local release tests: 10 pass / 0 fail, *not* cloud authorization evidence.

## Exact creation inventory

| Function | Current staging list | Secrets declared by immutable manifest |
| --- | --- | --- |
| `recordHistoricalCashDisposition` | Absent | None |
| `issueProposalClientReview` | Absent | `RESEND_API_KEY` |
| `getProposalClientReview` | Absent | None |
| `acceptProposalClientReview` | Absent | None |
| `createProposalCheckout` | Absent | `STRIPE_SECRET_KEY` |
| `stripeBillingWebhook` (HTTP) | Absent | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

`recordProposalPriorPayment` is an existing ACTIVE function; capture its current configuration and immutable rollback source before any approved update.

## Explicit blockers to clear — in order

1. **Service account provisioning:** An authorized operator must review creation of the one dedicated Billing runtime in *staging only*, confirm no conflicting identity, and record its exact resource identifier. Do **not** reuse a broad Editor identity.
2. **Least privilege IAM matrix:** Determine exact actor/resource/permission/scope for deployer `iam.serviceAccounts.actAs`, new Cloud Functions creation, build-account artifact access, Cloud Run post-build access, and the runtime's minimum Firestore and Secret Manager rights. Verify that any inherited roles do not exceed the reviewed scope. Do not assume a project's `testIamPermissions` result establishes authorization on a not-yet-created service.
3. **Broken legacy source-resource reference:** The PR394 manifest's `buildPermissionResources["storage.objects.get"]` currently points to `gcf-v2-sources-991554514268-us-central1/recordProposalPrepaidCash/function-source.zip`. This is **not verified as PR394's source**. Do not certify the six new functions using this older Billing object's IAM. Determine the exact generated Cloud Build source object and appropriate conditional policy before signing off.
4. **Cloud Run bootstrap:** Verify service creation and intended authenticated/public invocation boundary per function. `bootstrapPlan` proposes `gcloud run services update <name> --no-invoker-iam-check`; treat this as a separately reviewed public-invocation configuration action. For `stripeBillingWebhook`, verify signed Stripe event handling and ingress model before allowing external traffic.
5. **Secrets:** Verify the *names, existence, version state, and IAM bindings* for `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` in staging. Never print secret values, tokens, or webhook signing keys in logs or PRs. Confirm billing runtime and each function's minimum necessary access before grant.
6. **Stripe isolation:** Confirm test-mode Stripe account, exact intended staging HTTP webhook destination, enabled events, and signing secret correspondence. Stripe test-mode dashboard existence alone is not evidence of endpoint wiring. Avoid live billing operations.
7. **Protected validation and rollback:** Capture before-state for all seven functions, including absence evidence and rollback instructions for newly created functions, which require their own delete approval. Run approved read-only validation checks and review inconclusive results. A green local suite does not clear manual IAM gates.

## Suggested read-only local evidence collection (no secret values)

```bash
set -euo pipefail
PROJECT=sandman-combat-staging
REGION=us-central1

gcloud projects describe "$PROJECT" --format="table(projectId,projectNumber)"
gcloud iam service-accounts list --project="$PROJECT" \
  --filter="email~sandman-(billing-runtime|practice-deployer|practice-build)" \
  --format="table(email,disabled)"
gcloud functions list --v2 --project="$PROJECT" --regions="$REGION" \
  --format="table(name,state)"
gcloud secrets list --project="$PROJECT" \
  --filter="name~(RESEND_API_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)" \
  --format="table(name,createTime)"
```

Treat IAM, policy and secret metadata visibility errors as **unverified**, not as evidence of missing grants. Do not run `gcloud secrets versions access` to gather this evidence.

## Before any operator action

Require an explicit approval naming the staging project, exact account or role grant, principal, scoped resource, purpose, expected result, and rollback. Require a separate deployment approval **after** runtime/bootstrap evidence is complete. Do not change `validationOnly` or bypass fail-closed gates under this packet.

## Code follow-up for a separate review

PR #400 intentionally returns `INCONCLUSIVE` for six future Cloud Run services, runtime/secret metadata, and source Storage access. Its manual gate is a safety measure, not an authorization tool. Replace manual gates only when verification has a concrete read-only evidence source; keep ambiguous results blocked.
