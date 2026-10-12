# Batch E — staging readiness and certification preparation

Date: 2026-10-12

This batch prepares an isolated staging certification request. It does not
authorize or perform a deployment, IAM change, data migration, certificate
acceptance, XP/rank mutation, promotion, or AUTO activation.

## Isolation audit

| Boundary | Verified repository state | Stop condition |
| --- | --- | --- |
| Production project | `sandmandashboard` | Any staging command, credential, Web config, token audience, or initialized SDK resolving here |
| Staging project | `sandman-combat-staging` | Missing alias, arbitrary nonproduction project, or mismatch between credential/Web/CLI identities |
| Staging Hosting | Explicit site `sandman-combat-staging`; generated `.firebase-staging/public` root | Default/production target, missing site, or ordinary `public` root |
| Staging Functions | Generated `functions/.firebase-staging`, entrypoint `lib/staging.js` | Production `lib/index.js`, email/Stripe exports, or unreviewed function target |
| Authentication | Approved staging WIF provider and exact staging deployer identity | Static/production credential, wrong provider, wrong impersonated account, or unverified file |
| Runtime identity | Exact staging Wrestling runtime service account | Missing or different service account |
| Secrets | Staging test password only in GitHub environment; no value logged | Missing secret, production secret reference, or credential content in output |
| Rules | Shared reviewed `firestore.rules`; emulator denial tests required | Skipped rules tests or direct client historical-authority write succeeds |

The original web-config guard accepted any project other than production. Batch
E now accepts only the exact staging project. The staging Firebase config now
names an explicit staging Hosting site. `assert-staging-plan.mjs` validates the
aliases, generated roots, Hosting site, explicit confirmation, and unique subset
of reviewed deploy targets before Firebase CLI execution.

Production deployment workflows remain unchanged and explicitly name
`sandmandashboard`. The staging workflow is manual and environment-scoped, but
must not be dispatched until a separate staging-execution authorization is given.

## Privileged historical writer inventory

| Writer | Collections/identity affected | Revision requirement | Coverage |
| --- | --- | --- | --- |
| `practiceSessions.finalizePracticeAttendance` | `attendance_sessions`, athlete memories, attendance metadata | Increment each present athlete/discipline in the same transaction | `historyRevisionWriters.integration.cjs`, callable integration |
| `practiceSessions.savePracticeAthleteInput` | Athlete-session memory | Increment athlete/discipline when canonical input changes | `historyRevisionWriters.integration.cjs` |
| `practiceSessions.closePracticeSession` and memory completion | Practice closeout, attendance/memory completion | Increment affected athlete/discipline atomically | closeout revision integration |
| `skillCheckCoachCall` practice-backed Skill Check | `verifiedSkills`, current skill state | Increment only when verified observation changes | callable integration and unit assertions |
| `upsertAthleteCrossTrainingAssignment` | Cross-training home/host/discipline scope | Increment union of old and new disciplines | retry/concurrency integration |
| `approveAndActivate` existing-athlete attachment | Discipline/location placement | Increment attached or relocated affected disciplines | enrollment writer integration |
| `syncActivatedEnrollmentPlacement` | Athlete location and prior-location identity | Increment every recorded discipline on location change | location invalidation integration |
| `addDisciplineToAthlete` | Athlete discipline assignment | Increment newly attached discipline | discipline attachment/concurrency integration |
| `skillCheckCoachCall` historical review actions | Review revision, manifests, receipts, attestations, certificates, acceptance and revocation | Review revision and source revision are independently bound; no source increment for authority-only audit records | callable and rules emulator suites |

Repository search found no other privileged writer to finalized attendance,
athlete-session memories, verified historical observations, location history,
discipline assignment, cross-training scope, or review identity. Current skill,
XP, testing, promotion, access, and notes writers do not write trusted historical
source classes and cannot manufacture historical evidence.

Residual writer risk: repository inspection cannot prove that the deployed
staging revision matches this branch. Staging must exercise each writer and
observe exactly one revision increment before certification begins.

## Read-only legacy evidence inspection

`functions/scripts/inspect-historical-evidence.mjs` reports:

- missing/mismatched athlete, practice, and discipline identity on memories;
- orphaned verified-skill documents;
- verified-skill discipline mismatch;
- finalized-attendance and membership mismatches;
- practice scope outside current, previous, academy, or cross-training scope;
- histories above the 10,000-record certification limit.

It performs no writes. It defaults to `demo-*` Firestore emulator projects.
Non-emulator use requires the exact staging inspection confirmation plus the
same independently checked staging credential boundary as deployment. Production
and arbitrary project IDs are rejected.

## Synthetic fixtures and repeatable runner

`historical-certification-fixtures.mjs` deterministically defines synthetic-only
records and expected outcomes for small complete history, 55-practice history,
11 prior locations, cross-training, missing memory, missing attendance,
conflicting observations, source revision mutation, stale review, interruption,
and revocation after acceptance. Every record is marked with fixture owner
`batch-e-certification`.

`run-certification-emulator.mjs` accepts only a `demo-*` project and runs the
complete Firestore integration and authenticated rules suites. It contains no
deployment command. Existing tests cover Admin-only certification, Coach and
Management boundaries, independent attendance/memory discovery, resume/retry,
certificate integrity, revision invalidation, revocation, read-only preview, and
absence of XP/rank/promotion/lesson-execution side effects.

## Authorized staging execution checklist

Do not begin without a separate authorization for staging execution.

1. Record the requested commit SHA and require a clean checkout of that SHA.
2. Verify `.firebaserc`: default `sandmandashboard`, staging
   `sandman-combat-staging`.
3. Run the repository staging-readiness tests and emulator certification runner.
4. Verify GitHub environment is `staging`; verify WIF provider, deployer email,
   runtime service account, project number, and project ID without printing tokens.
5. Run `assert-staging-plan.mjs`; archive its non-secret JSON result with the run.
6. Confirm the generated staging package exports only the reviewed certification
   and canonical practice functions and targets only the explicit staging site.
7. Capture a staging-only preflight export/snapshot and record its identifier.
8. Run the read-only inspector before seeding. Any non-synthetic collision or
   malformed legacy evidence is a stop condition, not a migration request.
9. Seed only the deterministic `batch-e-certification` fixture manifest after
   inspecting every destination path.
10. Exercise each privileged writer and verify one exact source-revision change.
11. Execute small and resumable certification, forced interruption/retry,
    stale-source, stale-review, conflict, unauthorized, acceptance, and revocation
    scenarios.
12. Compare XP, rank, promotion, lesson-execution, and AUTO fields before/after.
    Any mutation is an immediate stop and rollback.
13. Preserve certification/audit logs and publish pass/fail/skip counts. Do not
    proceed when a required negative test is skipped.

## Rollback plan

- Never use recursive or blanket Firestore deletion.
- Stop callable traffic to the staging exercise before cleanup.
- Enumerate cleanup paths exclusively from the persisted synthetic fixture
  manifest and require `synthetic:true` plus the expected `fixtureOwner` before
  each targeted delete.
- Delete synthetic Auth users only when their UID and custom claims match the
  manifest. Never delete by email domain alone.
- Preserve authority/audit records when investigating a failure; mark the run
  aborted in the external test record instead of erasing evidence.
- If deployment artifacts must be rolled back, redeploy the previously recorded
  staging-only SHA to the same explicitly verified staging project and site.
- Re-run the read-only inspector and compare the staging snapshot after cleanup.
- Never restore, import, or delete anything in `sandmandashboard`.

## Explicit stop conditions

- Any resolved production identifier or credential.
- Project, project-number, Hosting-site, credential, runtime-account, or Web-config mismatch.
- Missing preflight snapshot or synthetic ownership manifest.
- Non-synthetic destination collision.
- Required test failure or skip.
- Revision increment is missing, duplicated, or affects the wrong discipline.
- Incomplete/contradictory history becomes certifiable.
- Unauthorized client or non-Admin callable action succeeds.
- Certification changes XP, rank, promotion, lesson execution, or AUTO state.
- Cleanup cannot identify exact synthetic paths without a broad query/delete.

## Residual assessment

Preparation is complete at repository level, but actual cloud identity,
resource existence, deployed commit parity, permissions, snapshots, and legacy
data shape cannot be proven without authorized staging access. Those checks are
mandatory preconditions, not assumptions.

**Readiness: CONDITIONAL.** Safe to request authorization for isolated staging
execution only after reviewers accept the plan and confirm the cloud-side
preflight inputs. This decision is not deployment permission.
