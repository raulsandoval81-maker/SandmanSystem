# Staging Phase 3: Runtime Identity Hardening

Date: 2026-10-12

Starting audit commit: `3000343426bf3bceb0c3b73eee603d06ab9e8ef5`

Operational scope: repository implementation and local/emulator testing only. No deployment, Cloud Run update, IAM change, backup, seed, live-data access, production operation, AUTO activation, or merge was performed.

Readiness: **CONDITIONAL**. Runtime identity generation and migration safeguards are ready for review. Callable transport normalization and the cloud recovery checkpoint remain mandatory pre-canary blockers.

## Functions hardened

The generated staging definitions for all twelve approved callables now use the exact dedicated runtime account `sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com`:

1. `getPracticeSession`
2. `getPracticeAttendanceReview`
3. `createOrRecoverCanonicalPractice`
4. `openPracticeSession`
5. `updatePracticeCheckIn`
6. `savePracticeSessionMemory`
7. `saveDailyPracticeLog`
8. `savePracticeAthleteInput`
9. `finalizePracticeAttendance`
10. `completePracticeDailyGrind`
11. `closePracticeSession`
12. `skillCheckCoachCall`

`resolveStagingCallableRuntimeOptions` is shared by the Wrestling callable and all practice callables. It emits the service-account override only when the exact staging project, acknowledgement, and runtime account agree. A platform project discovered through `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, or `FIREBASE_CONFIG` must also agree when present. Any staging marker makes incomplete or inconsistent configuration fail closed, preventing silent fallback to the Editor-bearing Compute account.

Production and normal emulator discovery remain compatible: without staging markers the resolver returns no override. A production platform project without staging markers therefore retains existing behavior; a production ID supplied through staging variables is rejected. No production source, workflow, project, identity, or deployment target was changed.

## Invocation-policy decision

Direct Firebase SDK callable access is the intended application model. Every handler rejects missing Firebase authentication before Firestore access and then applies existing active-staff, role, ownership, discipline, and location checks. Firestore rules continue to deny direct client writes to historical authority records.

Transport normalization is deliberately **blocked**, not falsely implemented. Inspection of the installed `firebase-functions` 4.7.3 code and generated endpoints showed that `onCall` accepts an `invoker` option at the type level but does not serialize it into the callable manifest. A local `invoker: "public"` option would therefore provide misleading assurance. The Phase 2 cloud audit also found inconsistent live Cloud Run enforcement. Before the first canary, an approved staging-only mechanism must prove that each selected service permits callable-protocol traffic without granting a broad project-level Invoker role. The likely per-service choices are a Firebase CLI version whose generated callable manifest demonstrably carries the intended policy, or a separately approved per-service Cloud Run invoker-IAM-check change. Neither was executed here.

Authentication security did not depend on Cloud Run IAM: local generated callables were invoked without `auth` and all twelve returned `unauthenticated` before data access. Existing emulator suites exercise Coach/Admin/Management and location boundaries, historical read/write separation, and denied direct authority writes.

## One-function migration mechanism

`scripts/staging/migrate-one-function.mjs` is a staging-only operator tool. It:

- accepts exactly one `--function` from a fixed twelve-function allowlist;
- requires a full `--commit` SHA equal to the checked-out `HEAD`;
- requires exact project and acknowledgement values;
- requires `SANDMAN_STAGING_MIGRATION_CONFIRM=MIGRATE:<function>:sandman-combat-staging`;
- validates `firebase.staging.json` and records the function, commit, project, expected runtime account, config, mode, and exact `functions:<name>` target;
- defaults to `--validate`, which performs no deployment;
- rejects production/arbitrary projects, unsupported functions, commit drift, and malformed configuration;
- has no Hosting, Firestore Rules, Storage, IAM, or seeding target;
- in a future explicitly authorized `--deploy` run, verifies the credential boundary, prepares the reviewed isolated package, and invokes the pinned Firebase CLI for only the selected function.

Validation example (safe only after replacing the SHA with the reviewed commit):

```sh
SANDMAN_STAGING_PROJECT_ID=sandman-combat-staging \
SANDMAN_STAGING_ACK=sandman-combat-staging \
SANDMAN_STAGING_MIGRATION_CONFIRM=MIGRATE:getPracticeSession:sandman-combat-staging \
node scripts/staging/migrate-one-function.mjs \
  --validate --function getPracticeSession --commit <approved-40-character-sha>
```

The `--deploy` mode was not run and is not authorized by this document.

## Automated safety coverage

The new tests prove:

- all twelve built callable endpoints carry the dedicated runtime identity;
- staging configuration fails closed while production and emulator defaults remain unchanged;
- every callable rejects missing Firebase authentication before data access;
- the migration allowlist contains exactly twelve approved functions;
- plans are exact-project, exact-confirmation, exact-commit, and one-function only;
- the migration implementation cannot select Hosting, Rules, Storage, seed logic, or IAM mutations;
- fixture safety remains `eligibleForAuto: false`, `xpAwarded: false`, `rankChanged: false`, `promotionApplied: false`, and `lessonExecutionStarted: false`.

Existing unit, integration, and rules suites remain the authority for role/scope denial, source-revision integrity, certificate/revocation behavior, and direct-client write denial.

Executed results:

| Suite | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Functions unit and generated-runtime tests | 60 | 0 | 0 |
| Staging isolation and hardening tests | 21 | 0 | 0 |
| Firestore emulator integration tests | 76 | 0 | 0 |
| Historical-authority security rules | 1 | 0 | 0 |
| **Total** | **158** | **0** | **0** |

## Recovery checkpoint preparation

No backup was created. Firestore PITR and delete protection remain disabled, so the first cloud canary is blocked until a separately authorized recovery checkpoint exists.

Proposed isolated destination: `gs://sandman-combat-staging-firestore-backups`. Before use, independently verify with an explicit staging-project query that the bucket exists, belongs to project number `991554514268`, has an approved staging-only location and retention policy, and grants no production principal or cross-project writer. If it does not exist, bucket creation requires separate approval; do not substitute an arbitrary bucket.

Exact proposed export operation, to be separately approved:

```sh
gcloud firestore export \
  gs://sandman-combat-staging-firestore-backups/runtime-migration/<UTC_TIMESTAMP> \
  --database='(default)' \
  --project=sandman-combat-staging
```

Verification must record the operation ID and successful terminal state, enumerate export metadata and collection namespaces, verify object ownership and checksums/metadata, and perform a documented restore-readiness review. Restoration requires an authorized operator, compatible database mode/location, the recorded export metadata, a tested collection selection strategy, and a separate change window. Never use blanket Firestore deletion, never overwrite production, and never restore into `sandmandashboard`.

Before migration, record all twelve Cloud Functions descriptions, Cloud Run revisions and traffic, runtime accounts, environment-variable names, secret references, function/Run IAM policies, and invocation annotations. Preserve Cloud Audit Logs and function logs through the rollback window; do not delete failed-revision evidence.

## Canary order and gates

Each step is serial. Any failure stops all later deployment.

1. `getPracticeSession` — first, read-only canary.
2. `getPracticeAttendanceReview` — broader read/query surface.
3. `createOrRecoverCanonicalPractice` — isolated deterministic create.
4. `openPracticeSession` — practice/live-session transaction.
5. `updatePracticeCheckIn` — draft attendance writer.
6. `savePracticeSessionMemory` — controlled practice-memory writer.
7. `saveDailyPracticeLog` — Coach-owned working log.
8. `savePracticeAthleteInput` — athlete history revision writer.
9. `finalizePracticeAttendance` — high-risk attendance/history writer.
10. `completePracticeDailyGrind` — XP-receipt-dependent readiness writer; it must not award XP.
11. `closePracticeSession` — closeout and missing-memory recovery writer.
12. `skillCheckCoachCall` — historical certificates, attestations, acceptance, revocation, and verified-skill authority; last.

Before each function: verify the explicit staging project/number, approved commit and artifact, prior revision, expected invocation policy, backup completion, dedicated-account roles, exact one-function plan, and clean audit baseline. After each function: verify the new revision and 100% traffic, dedicated runtime identity, invocation policy, authenticated allowed access, unauthenticated rejection, unauthorized-role/location denial, expected Firestore reads/writes on synthetic fixtures only, history-revision integrity, logs/error rate, empty unexpected secret references, and no unexpected mutations.

Historical certification, acceptance, and revocation must additionally prove no XP award, rank change, promotion, AUTO eligibility, Coach-approval bypass, or lesson execution. Production must be independently compared before and after and remain byte-for-byte/revision-for-revision unchanged where evidence permits.

## Rollback

On any identity, transport, authorization, Firestore, revision, logging, or isolation failure:

1. stop the sequence and preserve logs, descriptions, revision IDs, and synthetic records;
2. prevent further migration dispatches;
3. through separate staging-only approval, restore traffic or redeploy the exact recorded previous artifact for the single affected function;
4. verify its previous runtime identity, invocation behavior, and synthetic-data integrity;
5. restore Firestore only if code rollback is insufficient and only from the verified staging checkpoint using a reviewed selective plan;
6. never use blanket deletion, never restore into production, and do not change either service account's IAM during incident triage.

The default Compute account's Editor role must remain untouched until a separate project-wide dependency inventory and explicit IAM authorization are complete.

## Outstanding blockers

- Prove and authorize a consistent per-service callable transport mechanism; repository generation alone cannot currently establish it.
- Provision or verify the staging-owned backup destination and complete a restorable export.
- Obtain separate approval for the first one-function deployment and all cloud validation actions.
- Confirm the approved migration commit and deterministic generated artifact.
- Capture fresh pre-migration revision, IAM, and production-no-change baselines.
- Do not remove Editor from the default Compute account until every remaining dependency is separately inventoried.

Completing this engineering phase is not deployment authorization.
