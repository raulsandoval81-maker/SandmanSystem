# Proposed Change B: Single-Service Callable Transport

Status: **BLOCKED — explicit cloud-change approval is required.** This proposal does not authorize a function deployment or any other service change.

## Exact scope and current state

- Project: `sandman-combat-staging` (`991554514268`)
- Region: `us-central1`
- Function: `getPracticeSession`
- Cloud Run service: `getpracticesession`
- Active/ready revision: `getpracticesession-00002-lav`
- Traffic: 100% to the latest revision
- Runtime identity: `991554514268-compute@developer.gserviceaccount.com`
- Ingress: all
- `run.googleapis.com/invoker-iam-disabled`: absent
- Service IAM bindings: none

Read-only inspection therefore shows Cloud Run's invoker IAM check is not disabled and no service-level invoker binding exists. It does not by itself prove the exact external HTTP response. By contrast, `skillcheckcoachcall` has `run.googleapis.com/invoker-iam-disabled=true` with an empty service IAM policy. The Phase 4 single-service correction remains the narrowest supported proposal.

## Proposed change

After separate approval, re-read the exact before-state and execute only:

```sh
gcloud run services update getpracticesession \
  --region=us-central1 \
  --project=sandman-combat-staging \
  --no-invoker-iam-check
```

Do not add `allUsers` or project-level `roles/run.invoker`. Do not update another service, deploy a function, change runtime identity, modify IAM, or alter traffic as part of this change.

## Independent verification

1. Confirm explicit project ID/number and active operator identity before execution.
2. Capture service generation, revision, traffic, ingress, annotation, and IAM immediately before and after.
3. Require the only intended difference to be `run.googleapis.com/invoker-iam-disabled=true`; revision and traffic must remain expected.
4. Verify the service IAM policy remains empty and project IAM gained no `roles/run.invoker` grant.
5. Use the Firebase callable protocol with synthetic identities only: unauthenticated and invalid/expired authentication must reach the callable boundary but be rejected; an authorized in-location identity may read the expected synthetic session; unauthorized role, Management-as-Coach, wrong-location, and cross-scope identities must be denied.
6. Confirm no Firestore writes, XP, rank, promotion, AUTO, lesson execution, secret changes, or production revision changes.
7. Preserve sanitized HTTP status/error codes, timestamps, logs, and audit events without tokens or personal data.

Do not proceed to a function canary unless all verification passes and Change A has produced a verified recovery checkpoint.

## Rollback

On any unexpected result, stop testing and request approval to re-enable the check on this service only:

```sh
gcloud run services update getpracticesession \
  --region=us-central1 \
  --project=sandman-combat-staging \
  --invoker-iam-check
```

Then independently verify the annotation is absent/false, service IAM remains unchanged, the recorded revision and traffic remain intact, and production fingerprints are unchanged. Preserve failure evidence. Rollback does not include function deployment, IAM grants, or traffic migration.
