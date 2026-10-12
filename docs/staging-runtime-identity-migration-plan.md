# Staging Runtime Identity Security Audit and Migration Plan

Date: 2026-10-12

Reviewed branch: `codex/batch-e-staging-readiness` at `f3cb56d41fd09e98ba4c9a3af8d6a632e05b4da5`

Cloud scope: `sandman-combat-staging` (`991554514268`) only

Production exclusion: `sandmandashboard` was not queried or changed
Decision: **CONDITIONAL**

This is a read-only audit and an unexecuted migration design. No function was invoked or deployed; no IAM, secret, Firestore, Authentication, Hosting, or service-account state was changed.

## Evidence and limitations

The active Google Cloud CLI account was `raulsandoval81@gmail.com`. Every cloud command explicitly used `--project=sandman-combat-staging`; no CLI default was trusted. Read-only evidence came from Cloud Functions v2 descriptions, Cloud Run service descriptions and IAM policies, project and service-account IAM policies, Firestore database metadata, enabled-service metadata, and the reviewed repository. Cloud Functions source archives were not downloaded, so the deployed source cannot be asserted to equal the branch. Deployment timestamps and the runtime identity prove the cloud state is not the Batch E target state.

Project metadata matched the expected ID and number. The dedicated account exists, is described as staging-only, and has project-level `roles/datastore.user` and `roles/logging.logWriter`. Its service-account resource policy grants `roles/iam.serviceAccountUser` only to `sandman-staging-deployer@...`; this is the deployment principal's `actAs` permission, not a runtime permission or a general impersonation grant.

## Deployed 12-function identity inventory

All entries are active, Gen 2, Node.js 22, `us-central1`, 256 MiB, one CPU, 60-second timeout, maximum 20 instances, and route 100% of traffic to the listed revision. Every runtime service account is `991554514268-compute@developer.gserviceaccount.com`. Every Cloud Run service belongs to `projects/sandman-combat-staging/locations/us-central1/services/...`. No deployed function reported a secret-environment reference.

Common runtime environment-variable names are `EVENTARC_CLOUD_EVENT_SOURCE`, `FIREBASE_CONFIG`, `FUNCTION_TARGET`, `GCLOUD_PROJECT`, `LOG_EXECUTION_ID`, `SANDMAN_STAGING_ACK`, `SANDMAN_STAGING_PROJECT_ID`, and `SANDMAN_WRESTLING_RUNTIME_SERVICE_ACCOUNT`. The eleven practice functions additionally reported `FUNCTION_SIGNATURE_TYPE`. Values were inspected only to establish project isolation and are intentionally not reproduced.

| Function | Cloud Run service | Active revision | Firestore collections used | Access model |
|---|---|---|---|---|
| `closePracticeSession` | `closepracticesession` | `closepracticesession-00002-dag` | `staff`, `practiceSessions`, nested `athletes`, `attendance_sessions`, `liveSessions`, `xpAwardReceipts`, `athletes/*/historyRevisions` | Callable; source requires Firebase auth and active scoped staff |
| `completePracticeDailyGrind` | `completepracticedailygrind` | `completepracticedailygrind-00002-kug` | `staff`, `practiceSessions`, `attendance_sessions`, `xpAwardReceipts` | Callable; source requires Firebase auth and active scoped staff |
| `createOrRecoverCanonicalPractice` | `createorrecovercanonicalpractice` | `createorrecovercanonicalpractice-00002-map` | `staff`, `practiceSessions` | Callable; source requires Firebase auth and active scoped staff |
| `finalizePracticeAttendance` | `finalizepracticeattendance` | `finalizepracticeattendance-00002-jur` | `staff`, `practiceSessions`, nested `athletes`, `attendance_sessions`, `athletes`, `xpLogs`, `athletes/*/historyRevisions` | Callable; source requires Firebase auth and active scoped staff |
| `getPracticeAttendanceReview` | `getpracticeattendancereview` | `getpracticeattendancereview-00002-feg` | `staff`, `practiceSessions`, nested `athletes`, `attendance_sessions`, `athletes` | Callable; source requires Firebase auth and active scoped staff |
| `getPracticeSession` | `getpracticesession` | `getpracticesession-00002-lav` | `staff`, `practiceSessions` | Callable; source requires Firebase auth and active scoped staff |
| `openPracticeSession` | `openpracticesession` | `openpracticesession-00002-hig` | `staff`, `practiceSessions`, `attendance_sessions`, `liveSessions` | Callable; source requires Firebase auth and active scoped staff |
| `saveDailyPracticeLog` | `savedailypracticelog` | `savedailypracticelog-00002-jex` | `staff`, `practiceSessions` | Callable; source requires Firebase auth and active scoped staff |
| `savePracticeAthleteInput` | `savepracticeathleteinput` | `savepracticeathleteinput-00002-gem` | `staff`, `practiceSessions`, nested `athletes`, `attendance_sessions`, `athletes/*/historyRevisions` | Callable; source requires Firebase auth and practice ownership |
| `savePracticeSessionMemory` | `savepracticesessionmemory` | `savepracticesessionmemory-00002-zuz` | `staff`, `practiceSessions` | Callable; source requires Firebase auth and practice ownership |
| `skillCheckCoachCall` | `skillcheckcoachcall` | `skillcheckcoachcall-00015-kah` | `staff`, `athletes`, `practiceSessions`, `attendance_sessions`, `athleteCrossTrainingAssignments`, `coachLessonPlans`, nested verified skills, history revisions, native-history checkpoints, transfer reviews, manifests, receipts, attestations, certificates, decisions, traversals, certification runs and revocations | Callable; transport is public and source requires Firebase auth plus action-specific Coach/Admin authorization |
| `updatePracticeCheckIn` | `updatepracticecheckin` | `updatepracticecheckin-00002-bot` | `staff`, `practiceSessions`, `attendance_sessions`, `athletes` | Callable; source requires Firebase auth and active scoped staff |

### Invocation-policy discrepancy

The Cloud Run annotation `run.googleapis.com/invoker-iam-disabled=true` exists only on `skillcheckcoachcall`, making its transport reachable without Cloud Run IAM while application code rejects missing Firebase authentication. The eleven practice services have no such annotation. Their service-level IAM policies contain no bindings, and the project policy has no `roles/run.invoker` binding. They therefore appear IAM-protected at the transport layer and may be unreachable by normal Firebase client SDK callers. They were not invoked, per scope, so this is an evidence-backed configuration discrepancy rather than a runtime test result. The migration must decide and explicitly preserve the intended model: public transport plus mandatory callable authentication for direct Firebase clients, or private transport with a named invoker architecture.

## Source permission audit

The staging entry point initializes Firebase Admin with Application Default Credentials and exports only the twelve reviewed callables. Static inspection of the executable dependency surface found:

- Firestore Admin SDK reads, queries, transactions, creates, sets, updates, and server timestamps.
- No Firebase Authentication administration (`getAuth`, user creation, claims, or deletion).
- No Cloud Storage use.
- No Secret Manager lookup and no `defineSecret` dependency in this staging surface.
- No Pub/Sub, Cloud Tasks, Scheduler, or Eventarc handler.
- No external HTTP/API client.
- No application call to the Cloud Logging API; platform stdout/stderr collection may still be retained and proven separately.
- Historical manifests, attestations, certificates, acceptance decisions, source revisions, and revocations are Firestore documents written by action-specific branches of `skillCheckCoachCall` after server-side Admin/Coach authorization checks.

The Firebase callable framework's ID-token processing and the use of `request.auth` do not make the runtime account a Firebase Auth administrator. Function invocation policy is also separate from the runtime account's data-plane roles.

## Runtime IAM permission matrix

| Capability | Functions | Runtime permission conclusion | Scope/type |
|---|---|---|---|
| Read/query Firestore | All 12 | Required; `roles/datastore.user` provides data access | Project-level runtime IAM |
| Create/update Firestore documents and transactions | All except read-only paths within `getPracticeSession`/review actions | Required; `roles/datastore.user` is the appropriate predefined data-plane role | Project-level runtime IAM |
| Write application logs through Logging API | None found directly | Not proven necessary; retain `roles/logging.logWriter` during migration, then test removal separately | Project-level runtime IAM |
| Firebase Auth administration | None | Not required; do not grant `roles/firebaseauth.admin` | Project-level runtime IAM |
| Secret payload access | None; deployed secret-reference lists are empty | Not required; do not grant Secret Manager accessor | Secret resource IAM |
| Storage object access | None | Not required | Bucket IAM |
| Pub/Sub, Tasks, Scheduler | None | Not required | Service/resource IAM |
| Invoke the function | Client/caller concern, not runtime identity | Must be intentionally configured per service; do not grant runtime account `run.invoker` merely to run itself | Function/Cloud Run IAM |
| Deploy as dedicated account | Deployment principal only | `sandman-staging-deployer` already has `roles/iam.serviceAccountUser` on the dedicated account | Service-account resource IAM |
| Mint tokens/impersonate runtime account | Runtime does not require it | Do not grant Token Creator to the runtime account or broad principals | Service-account resource IAM |

No missing runtime data-plane role was identified from source. Sufficiency is still a prerequisite rather than a completed proof because the functions have not executed under the dedicated identity. A controlled canary must validate Firestore reads, writes, queries, transactions, revision increments, and certificate/revocation paths before removing any existing fallback privilege.

## Privilege comparison

| Identity | Current roles relevant to audit | Assessment |
|---|---|---|
| Default Compute account | Project-level `roles/editor` | **Critical overprivilege.** All twelve internet-addressable function runtimes inherit broad project mutation permissions unrelated to their Firestore-only source needs. |
| Dedicated Wrestling runtime | Project-level `roles/datastore.user`, `roles/logging.logWriter` | Narrow and aligned with observed dependencies. No Auth admin, secret access, storage, Pub/Sub, Tasks, Scheduler, deployment, IAM, or token-minting role was found. |
| Staging deployer | Deployment roles plus Firestore/Auth/Hosting/Rules access; `serviceAccountUser` on dedicated runtime | Deployment-time identity. It must never be used as a runtime identity. Its broad deployment permissions are not inherited by the dedicated runtime. |

The default Compute account and App Engine default account both have project Editor. This plan addresses only the twelve functions' runtime dependency. Removing Editor from either account requires a separate project-wide dependency inventory; it must occur only after all workloads have been enumerated and the function migration is proven.

## Source and deployment architecture assessment

Repository isolation controls are strong: `.firebaserc` distinguishes production and staging, `firebase.staging.json` names the staging Hosting site and generated Functions source, the deployment script always supplies an explicit project, and the boundary guard verifies the WIF provider, staging deployer, runtime identity, acknowledgements, and exact allowed targets.

The current assignment mechanism is incomplete:

- `functions/src/config/functionRuntime.ts` returns the dedicated `serviceAccount` only inside the exact staging environment.
- `skillCheckCoachCall` passes that option to `onCall`.
- The eleven practice functions call `onCall(handler)` without runtime options.
- `functions/src/staging.ts` only re-exports already-created functions; it cannot retrofit their runtime identity.
- The generated staging `.env` correctly carries the dedicated-account name, but an environment variable alone does not select the runtime identity.

This explains at least eleven default-account assignments. The deployed `skillCheckCoachCall` also uses the default account even though current source would request the dedicated account. Its active revision predates Batch E and therefore cannot be treated as evidence that the current option failed. The deployment's common source hash and 2026-10-11 update times, versus the 2026-10-12 Batch E commit, confirm that cloud state is older than Batch E.

The existing manual staging workflow is unsuitable as the migration executor without revision: it deploys Hosting, all twelve functions, and Firestore rules in one command, then seeds synthetic data. Runtime migration needs a functions-only, one-function-at-a-time path with no Hosting, Rules, or seed step.

No runtime resource or environment name observed resolved to `sandmandashboard`. `FIREBASE_CONFIG`, `GCLOUD_PROJECT`, function resource names, source buckets, Artifact Registry, service accounts, and WIF references resolved to staging. The repository retains a production default alias by design, which is why every migration command must include the exact staging project and pass the fail-closed guards.

## Security findings

1. **Critical — Editor-bearing runtime identity.** All twelve functions execute as the default Compute account with project Editor, far beyond their Firestore-only needs. A function compromise would inherit broad staging-project mutation authority.
2. **High — Runtime assignment incomplete.** Eleven current definitions cannot request the dedicated runtime account. Deploying them from this branch would leave the identity problem unresolved.
3. **High — Callable transport policy is inconsistent.** `skillCheckCoachCall` has IAM invoker checks disabled while the eleven practice services have empty IAM policies and no disabled-check annotation. Migration could accidentally change reachability unless invocation policy is explicit and tested.
4. **High — No restorable database checkpoint is currently assured.** Firestore reports PITR disabled, delete protection disabled, and only a one-hour version-retention period. A separately authorized export/snapshot strategy is required before write-path canaries.
5. **Medium — Deployed source is older than Batch E.** Cloud behavior cannot be equated with reviewed source; a reviewed artifact/SHA-to-revision record is required.
6. **Medium — Migration workflow is too broad.** The existing job couples function deployment to Hosting, Rules, and synthetic seeding.
7. **Low — Dedicated logging role may be unnecessary.** No direct Logging API call was found. Retain it for the first migration and evaluate removal only through a separate negative-permission test.
8. **Informational — No runtime secret or production reference detected.** Deployed secret lists were empty and observed resource identities were staging-only.

## Required permission and code corrections (not implemented)

1. Create a separately reviewed code change that applies the same exact staging-only runtime-options resolver to all twelve callables. Outside the exact staging project/acknowledgement/account tuple, it must return no override or fail closed as appropriate; production behavior must remain unchanged.
2. Make invocation intent explicit for every callable. If browser/mobile Firebase clients invoke directly, configure public transport and retain mandatory `request.auth` plus staff authorization. If private invocation is intended, document and grant only named invokers. Do not mix models accidentally.
3. Keep only `roles/datastore.user` and, initially, `roles/logging.logWriter` on the dedicated runtime. Add no Auth, Secret Manager, Storage, Pub/Sub, Tasks, Scheduler, Editor, Owner, deployment, or token-creation role unless a failed canary is tied to a specific documented API call and permission.
4. Preserve deployer `serviceAccountUser` on the dedicated account; do not grant this to the function runtime or broad principals.
5. Add automated assertions that all twelve generated endpoint definitions name the dedicated account under staging and that production/local discovery never acquires it.
6. Create a migration-only workflow or operator checklist that deploys exactly one named function at a time, never seeds data, and never includes Hosting or Firestore Rules.

## Controlled staging-only migration plan

This sequence requires separate human approval and is not authorized by this report.

1. Freeze staging deployments and record Batch E SHA, Firebase CLI version, active project number, all twelve function descriptions, Cloud Run revisions/traffic, function and Run IAM policies, environment-variable names, secret references, runtime identities, and project IAM policy.
2. Establish a separately authorized Firestore backup/export with a staging-only destination and record its completion and restore procedure. Do not use blanket deletion. Because PITR and delete protection are disabled, do not proceed without a verified recovery artifact or an approved equivalent snapshot strategy.
3. Prepare and review the runtime-option code correction and tests. Build a deterministic artifact from the approved SHA; record its checksum. Ensure the generated package exports only the twelve staging functions.
4. Confirm the dedicated account still has exactly `datastore.user` and `logging.logWriter`; confirm only the staging deployer can `actAs` it. Use IAM Policy Troubleshooter or dry-run evidence where available; do not grant speculative roles.
5. Resolve the invocation-policy decision and capture a pre-migration authenticated/unauthenticated expectation matrix without calling production.
6. Deploy one low-risk read path first: `getPracticeSession`. The command must specify `--project=sandman-combat-staging`, the staging config, and only that function. Do not use the current broad workflow.
7. Verify its new Cloud Functions and Cloud Run revision, 100% traffic, dedicated runtime identity, environment names, empty secret list, invocation policy, health logs, authenticated success, unauthenticated rejection, scoped-staff denial, and no unexpected writes.
8. Update remaining lower-risk/read paths individually: `getPracticeAttendanceReview`, then the state-creation and working-memory paths (`createOrRecoverCanonicalPractice`, `openPracticeSession`, `updatePracticeCheckIn`, `savePracticeSessionMemory`, `saveDailyPracticeLog`). Stop on any IAM, authorization, revision, or data-integrity anomaly.
9. Update the higher-risk historical/attendance writers individually: `savePracticeAthleteInput`, `finalizePracticeAttendance`, `completePracticeDailyGrind`, `closePracticeSession`, then `skillCheckCoachCall` last. After each, verify only the expected revision and Firestore mutations using synthetic fixture ownership markers.
10. Run the approved Batch E staging certification sequence: Admin/Coach boundaries, independent attendance/memory coverage, retry/resume, source-revision increments, certificate integrity, revocation, read-only previews, and proof of no unintended XP, rank, promotion, AUTO, or lesson execution.
11. Confirm all twelve service configurations name the dedicated account and no service uses the default Compute account. Confirm production function revisions, IAM, and runtime identities are unchanged using an independently authorized read-only comparison; do not change production.
12. Observe staging logs and error rates through the approved soak window. Only after all other staging workloads using the default Compute account are inventoried and the twelve migrated functions pass should a separate IAM change request consider removing Editor from that account. That removal is not part of the function deployment and must have its own rollback.

## Post-migration validation matrix

- **Identity:** exact staging project/number; dedicated account on every function; no production resource URI.
- **Invocation:** expected transport policy; Firebase unauthenticated calls rejected; valid scoped Coach/Admin behavior preserved; cross-location and role violations denied.
- **Firestore:** read, query, transaction, create, update, and idempotent retry paths succeed only on synthetic records.
- **Historical authority:** revision increments remain atomic; stale identities fail; certificate creation, acceptance separation, and revocation remain auditable.
- **Side effects:** no unauthorized XP/rank/promotion changes, AUTO activation, live-athlete access, or unattended lesson execution.
- **Secrets/services:** no secret reference appears; no Storage, Auth-admin, Pub/Sub, Tasks, Scheduler, or external API permission is requested.
- **Observability:** function and platform logs remain available without credential content.
- **Isolation:** Hosting, Rules, IAM, secrets, and production revisions remain unchanged.

## Rollback procedure

1. Stop immediately on IAM denial, unexpected caller reachability, authentication bypass, wrong project/resource name, unexplained write, revision mismatch, secret attachment, data-integrity failure, or production drift.
2. Disable further migration workflow dispatches and preserve logs, function descriptions, failing revision IDs, and synthetic data for audit.
3. Shift the affected Cloud Run service back to the recorded previous revision only through a separately approved staging-only rollback, or redeploy the exact previously recorded artifact/config if Cloud Functions management requires it. Do not roll back by broad Firebase deployment.
4. Verify the prior runtime identity and invocation behavior, then run read-only integrity checks against the synthetic fixture set.
5. Restore Firestore only from the verified staging recovery artifact and only if integrity checks prove rollback of code/revision is insufficient. Never use blanket deletion and never touch production.
6. Do not remove the dedicated account's roles or alter the default account during incident triage. IAM rollback is a separate explicit action.

## Remaining blockers and readiness

**CONDITIONAL — the migration design is sound, but migration is not yet authorized or ready to execute.** Remaining prerequisites are:

- implement and review explicit dedicated runtime options for the eleven practice functions;
- decide and test a uniform invocation model for all twelve services;
- create and verify a staging Firestore recovery checkpoint because PITR/delete protection are disabled;
- create a narrow functions-only migration mechanism with no Hosting, Rules, or seed operations;
- prove the dedicated account's permissions through one-function canaries and the synthetic certification suite;
- inventory every other staging dependency on the default Compute account before any Editor-role removal;
- establish an independently checked production-no-change baseline and post-migration comparison.

No additional runtime role should be granted merely to clear these blockers. A failed test must identify the exact denied permission and corresponding source operation before any narrowly scoped correction is proposed.
