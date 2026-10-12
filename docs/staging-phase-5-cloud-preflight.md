# Staging Phase 5: Cloud Preflight and Canary Baselines

Date: 2026-10-12

Observation window: 2026-10-12T15:23:33Z–15:34Z
Reference commit: `cb3cad09c34fa90784ef7eda8ee648bd9d44b709`

## Decision

Overall readiness is **BLOCKED** for the first `getPracticeSession` canary.

Repository controls and read-only cloud access pass. The canary remains blocked because callable transport is inconsistent, all twelve live functions still use the Editor-bearing default Compute account, PITR and delete protection are disabled, no backup/export exists, and the proposed recovery bucket does not exist. Phase 5 made no cloud changes.

| Area | Result | Basis |
|---|---|---|
| Explicit project/account identity | PASS | Direct cloud query |
| Firebase app and Hosting identity | PASS | Direct Firebase CLI query |
| Twelve-function inventory | PASS | Direct cloud query; exactly 12, no unexpected functions/services |
| Dedicated runtime migration | BLOCKED | Direct cloud query; all 12 still use default Compute account |
| Callable transport consistency | BLOCKED | Direct cloud query; only `skillCheckCoachCall` disables invoker IAM check |
| Handler authentication/authorization | CONDITIONAL | Local tests pass; invalid/expired live-token behavior was not exercised |
| Firestore recovery checkpoint | BLOCKED | Direct cloud query; PITR/delete protection disabled, no backup/export/bucket |
| Production no-change baseline | PASS | Minimal explicit production query only |
| Phase 4 artifact controls | PASS | Local source/test inspection; validation-only run required after final commit |

## Identity and Firebase configuration

The active authenticated account was `raulsandoval81@gmail.com`. The CLI default project was `sandmandashboard`; it was neither used implicitly nor changed. Every cloud query used an explicit `--project` argument.

- Staging: `sandman-combat-staging`, number `991554514268`, ACTIVE.
- Production: `sandmandashboard`, number `889326401061`, ACTIVE.
- Firestore/Firebase data location: `nam5`; Functions/Cloud Run region: `us-central1`.
- Firebase web app: `Sandman Combat Staging Web`.
- Hosting: default site `sandman-combat-staging`.
- Staging deployer exists and is enabled. Its observed project roles are recorded in the sanitized baseline.
- Dedicated runtime account exists and is enabled with `roles/datastore.user` and `roles/logging.logWriter`.
- CLI versions: gcloud 588.0.0, Firebase CLI 15.11.0, Node 22.17.1, npm 10.9.2.

## Functions, revisions, and transport

All twelve expected functions are ACTIVE, Gen 2, Node.js 22, `us-central1`, ingress `all`, with 100% traffic to the latest ready revision. No unexpected function or Cloud Run service was found. No secret references were present. Only environment-variable names were captured.

All twelve currently run as `991554514268-compute@developer.gserviceaccount.com`, which retains project-level `roles/editor`. This does not match the Phase 4 artifact's dedicated runtime identity and is expected to remain so until a separately authorized one-function deployment.

The eleven practice services have no `run.googleapis.com/invoker-iam-disabled` annotation and empty service IAM policies. `skillcheckcoachcall` alone has the annotation set to `true`, also with an empty service IAM policy. All use ingress `all`. Read-only metadata strongly supports the Phase 4 conclusion, but no live HTTP request was sent, so actual callable reachability is classified **not directly verified**.

There are 37 ready revisions: 12 active and 25 inactive. Each practice service has two revisions; `skillcheckcoachcall` has fifteen. None of the inactive revisions receives traffic. They are retained evidence, not currently active mismatches.

The exact active revision/traffic/service mapping and sanitized configuration names are in `docs/evidence/staging-phase-5/baseline.json`.

## Recovery readiness

Firestore `(default)` is Native/Standard in `nam5`. Direct inspection found:

- PITR: disabled;
- delete protection: disabled;
- version retention: 3600 seconds;
- backup schedules: none;
- backups: none;
- import/export operations: none.

The staging project contains only the two Cloud Functions system buckets returned by the inventory. `gs://sandman-combat-staging-firestore-backups` returned `BucketNotFoundException: 404`. Its ownership, location, retention, lifecycle, versioning, and IAM therefore cannot be evaluated. Change A defines the required creation and export proposal; nothing was created or exported.

## Production isolation baseline

The only production reads were project identity and high-level configuration for the same twelve function names. No production Firestore document, Auth user, secret, environment value, log, or athlete record was accessed. The twelve production revision identifiers are stored in the sanitized baseline for later no-change comparison.

## Phase 4 controls

At preflight start, `HEAD` exactly matched `cb3cad09c34fa90784ef7eda8ee648bd9d44b709`, and both worktree and index were clean. Inspection and tests confirmed that validation is the default, a full SHA must equal `HEAD`, one allowlisted function is required, the staging ID/number/runtime account must be exact, dirty/index/untracked/symlink states fail, a fresh tracked-source build is checksummed, Hosting/Rules/Storage/seed/IAM targets are unavailable, and deploy mode remains gated on separate callable-transport evidence and staging credential verification. Deployment mode was not run.

## Local verification

| Suite | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Functions TypeScript/unit/runtime identity | 60 | 0 | 0 |
| Staging isolation/readiness/hardening | 27 | 0 | 0 |
| Firestore emulator integration | 76 | 0 | 0 |
| Firestore authority rules | 1 | 0 | 0 |
| **Total** | **164** | **0** | **0** |

These results prove local authorization and repository safeguards, not deployed Cloud Run reachability or expired-token behavior.

## Commands and evidence method

Commands were read-only and explicitly targeted. Sensitive values were removed before output where applicable:

```text
gcloud auth list --filter=status:ACTIVE
gcloud projects describe <explicit-project>
gcloud functions list --v2 --project=<explicit-project> --regions=us-central1
gcloud run services list --project=sandman-combat-staging --region=us-central1
gcloud run services get-iam-policy <exact-service> --project=sandman-combat-staging --region=us-central1
gcloud run revisions list --project=sandman-combat-staging --region=us-central1
gcloud iam service-accounts list --project=sandman-combat-staging
gcloud projects get-iam-policy sandman-combat-staging
gcloud firestore databases describe --database='(default)' --project=sandman-combat-staging
gcloud firestore backups schedules list --database='(default)' --project=sandman-combat-staging
gcloud firestore backups list --location=nam5 --project=sandman-combat-staging
gcloud firestore operations list --project=sandman-combat-staging
firebase apps:list --project sandman-combat-staging
firebase hosting:sites:list --project sandman-combat-staging
gsutil ls -p sandman-combat-staging
gsutil ls -L -b gs://sandman-combat-staging-firestore-backups
```

## Errors and limitations

- Sandboxed gcloud initially could not write its local log/credentials database; the same read-only queries succeeded with approved access to the existing CLI configuration.
- `gcloud storage buckets list` failed locally with `CommandLoadFailure: module 'ssl' has no attribute 'PROTOCOL_TLSv1'`. Read-only `gsutil` fallback succeeded and established the project bucket names and proposed-bucket 404.
- The Hosting JSON transformation initially used the wrong result shape; the untransformed retry succeeded.
- No write-path request, live authentication request, cloud resource mutation, secret read, or document read was performed.

## Remaining prerequisites

1. Review and separately approve Change A; create and verify the staging-only bucket, then complete and validate a recoverable export.
2. Review and separately approve Change B; correct and independently verify transport for `getpracticesession` only.
3. Re-capture the staging and production fingerprints immediately before change execution.
4. Approve the exact migration commit/artifact checksum and separately authorize the one-function deployment.
5. After deployment, prove the dedicated runtime account, callable protocol, authorization matrix, read-only synthetic behavior, logs, rollback readiness, and production no-change state.

Neither Change A nor Change B authorizes a function deployment. Phase 5 does not authorize either change.
