# Change C first-canary environment preservation and recovery gate

Status: **DRAFT / NO DEPLOY AUTHORIZATION**. This branch is a proposed follow-up to immutable release `dd6877f11e60f91b9afc16917281968609a81867`. It is **not** an approved release SHA. The protected dispatcher remains pinned to the old SHA and must not be run to deploy this draft. Do not retarget or unlock the dispatcher automatically.

## Scope
- Project: `sandman-combat-staging` (991554514268), region `us-central1`.
- Exactly one function / service: `getPracticeSession` / `getpracticesession`.
- No production deployment, IAM edit, WIF edit, Firestore write, data import, or traffic change in this PR.
- The script changes `--set-env-vars` to `--update-env-vars`, preserving existing unrelated user-defined environment variables while applying the approved staging values.

## Recorded pre-canary baseline (2026-10-15)
- Current active/ready revision: `getpracticesession-00002-lav` with 100% traffic.
- Previous ready revision: `getpracticesession-00001-nuk`.
- Existing service-account identity: `991554514268-compute@developer.gserviceaccount.com` for build and runtime.
- Present existing custom environment variable: `SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT`.
- HTTP trigger target: `getPracticeSession`; platform-managed `FUNCTION_TARGET`, `FUNCTION_SIGNATURE_TYPE`, `FIREBASE_CONFIG`, `GCLOUD_PROJECT`, and related values must remain valid.
- Cloud Run `run.googleapis.com/invoker-iam-disabled=true` was applied on staging only.
- The unauthenticated Firebase callable request returned HTTP 401 / `UNAUTHENTICATED`, `Staff authentication required.`; this verifies reachability and the negative auth case only, **not** full permission/location test coverage.
- Staging Firestore export operation completed October 13, with four nonzero objects. No recovery import has been tested; no current-date incremental checkpoint is claimed.

## Required checks before a separately authorized canary
1. Re-confirm exact project number, operator identity, active revision, traffic, invoker-check annotation and service-level IAM. Stop on any drift.
2. Capture the full current function configuration securely (environment values and secret references must not be posted into logs or pull requests); separately review whether provider-managed env variables are regenerated under `gcloud functions deploy`.
3. Confirm the dedicated build/runtime/deployer accounts have exactly the needed permissions, including WIF and service-account impersonation. Do not broaden IAM automatically.
4. Test immutable code and artifact integrity in a fresh checkout. Verify the new release SHA, the selected function, and the invocation transport evidence.
5. Validate the application's access controls using synthetic callers: unauthenticated and invalid token denied; authorized same-location Coach read permitted; other roles and cross-location reads rejected.
6. Verify an operator-approved recovery method (including permissions to restore traffic, the old image digest's continued availability, and separate Cloud Functions metadata/config consistency).
7. Only then create a new reviewed immutable release and separately authorize and update the protected dispatcher, preserving its SHA and branch protections. No automatic activation from this draft PR.

## Recovery target and procedure (PLAN ONLY; DO NOT EXECUTE)
The candidate code/config recovery target is the pre-canary revision `getpracticesession-00002-lav`. An operator can **consider**, after incident-specific approval, directing Cloud Run traffic back to this revision:

```sh
gcloud run services update-traffic getpracticesession \
  --region=us-central1 \
  --project=sandman-combat-staging \
  --to-revisions=getpracticesession-00002-lav=100
```

This is a **state-changing rollback proposal**, not a tested rollback, and requires explicit separate authorization. A traffic switch alone may leave Cloud Functions deployment metadata, runtime policy, and service-wide settings inconsistent. Confirm the old revision is ready and retained, and verify the callable's Firebase authentication and functionality after any recovery. If traffic rollback is unavailable or inadequate, stop for a separately approved targeted function/config restoration. No other service or production project may be changed.
