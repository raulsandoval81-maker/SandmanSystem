# Staging Phase 4: Callable Transport and Artifact Integrity

Date: 2026-10-12

Reference branch: `codex/staging-phase-3-runtime-hardening`
Phase 4 branch: `codex/staging-phase-4-transport-integrity`

Scope: repository investigation, hardening, documentation, and local/emulator testing only. No deployment, Cloud Run or IAM update, resource creation, backup, secret change, staging-data write, production access, merge, XP/promotion change, or AUTO activation was performed.

## Decision

Status: **CONDITIONAL**, with the first canary **BLOCKED**.

The installed `firebase-functions` package is 4.9.0. Its Gen 2 `onRequest` serializer emits an invoker field, but its `onCall` serializer emits only a callable trigger and does not serialize the accepted invoker option. Review of the current upstream TypeScript source found the same behavior. A package upgrade would therefore not be a proved fix and no major upgrade was made.

The application boundary remains Firebase callable authentication plus handler authorization. Firebase client SDKs attach Authentication and App Check tokens when available, and the callable trigger validates those tokens before exposing decoded authentication context. Every reviewed handler still rejects missing authentication before Firestore access, then applies its existing active-staff, role, ownership, discipline, and location checks. This does not resolve the separate Cloud Run transport inconsistency observed in staging.

The narrow proposed cloud remedy is a staging-only, per-service Cloud Run configuration that disables the invoker IAM check for the one selected callable service, followed by independent authenticated/unauthenticated callable-protocol verification. Do not grant project-wide `roles/run.invoker`. This operation changes cloud state, is not implemented by the callable manifest, requires separate approval, and was not run. Until evidence records the exact staging project number, service, revision, annotation/IAM state, and protocol tests, migration deploy mode fails closed.

## One-function artifact controls

`scripts/staging/migrate-one-function.mjs` now defaults to validation and enforces:

- exactly one function from the fixed twelve-function allowlist;
- the exact staging ID `sandman-combat-staging`;
- exact acknowledgement and `MIGRATE:<function>:sandman-combat-staging` confirmation;
- explicit project number `991554514268` and the exact dedicated runtime service account;
- a full approved SHA equal to `HEAD`;
- a clean worktree and index, with no untracked/ignored Function source or tracked source symlink;
- a fresh package compiled directly into `functions/.firebase-staging`, never copied from stale `functions/lib`;
- a manifest binding commit, function, project, project number, runtime identity, Firebase config, exact deploy target, tracked-source checksum, and artifact checksum;
- immediate checksum and manifest re-verification before any deploy path;
- the pinned Firebase CLI `15.11.0` and only `functions:<selected-name>`.

The package contains compiled Functions code, the reviewed package metadata/lockfile, and staging runtime variables. It does not package Hosting, Firestore or Storage rules, seed data, or an IAM operation. Symlinks and unexpected non-regular artifact entries are rejected. Validation mode builds and verifies the artifact but does not contact Firebase or Google Cloud.

Deploy mode additionally requires the normal verified staging credential boundary and separately supplied transport evidence bound to the exact staging project and number. These variables are gates, not deployment authorization. The script does not modify transport or IAM.

## Verification results

| Classification | Check | Result |
|---|---|---|
| PASS | TypeScript build, Functions unit, runtime assignment, unauthenticated rejection | 60 passed, 0 failed, 0 skipped |
| PASS | Staging isolation/readiness and Phase 4 hardening | 27 passed, 0 failed, 0 skipped |
| PASS | Firestore emulator integration authorization and isolation | 76 passed, 0 failed, 0 skipped |
| PASS | Historical-authority Firestore security rules | 1 passed, 0 failed, 0 skipped |
| **PASS** | **Total local automated checks** | **164 passed, 0 failed, 0 skipped** |
| CONDITIONAL | Invalid/expired tokens | Firebase callable protocol performs token validation; live staging proof remains required |
| BLOCKED | Consistent Cloud Run callable transport | Requires a separately authorized per-service cloud update and read-back/protocol proof |
| BLOCKED | First canary | Transport evidence and a verified recovery checkpoint do not yet exist |

The authorization integration suite specifically covers Management denial of the Coach callable, Coach/Admin separation, location and cross-athlete scope denial, Admin-only historical review/certification paths, certificate/source-revision freshness, and the absence of AUTO authorization. Security-rules testing proves Firebase clients cannot create, update, or delete historical baseline/certificate authority records. Local tests do not claim to validate expired-token handling by the deployed Google front end.

## Pre-canary checklist: `getPracticeSession`

All items must be independently recorded before authorization:

1. Approved Phase 4 commit equals checked-out `HEAD`; worktree/index are clean.
2. Validation produces a manifest whose function is `getPracticeSession`, target is only `functions:getPracticeSession`, and both checksums verify.
3. Project resolves to `sandman-combat-staging` / `991554514268`; credentials resolve only to the approved staging deploy identity; production `sandmandashboard` is absent.
4. Artifact endpoint definition carries `sandman-wrestling-runtime@sandman-combat-staging.iam.gserviceaccount.com`.
5. Current function and Cloud Run service configuration, revision, traffic, runtime identity, environment-variable names, secret references, IAM, and invocation annotations are captured.
6. A separately approved per-service callable transport method is applied and proved for this service only. Record the exact command/result without credential values. Confirm no broad project-level Invoker grant.
7. A separately authorized, verified staging recovery checkpoint exists and has documented restore readiness.
8. Synthetic authenticated Coach/Admin/Management allowed cases pass; unauthenticated, unauthorized role, wrong location, and cross-scope cases fail before data access.
9. The canary performs its expected read-only Firestore behavior only. No production access, XP, rank, promotion, lesson execution, or AUTO eligibility occurs.
10. Logs, error rate, revision health, runtime identity, callable protocol behavior, and production-no-change evidence pass before considering another function.

Stop immediately on any mismatch. Preserve logs and revision evidence, dispatch no later function, and use only a separately approved staging rollback to the recorded previous revision/artifact.

## Required operator procedure for transport evidence

This is a review procedure, not an instruction to execute without authorization:

1. Resolve and record the selected Gen 2 function's exact Cloud Run service in `us-central1` under project `sandman-combat-staging`.
2. Confirm project number `991554514268`, selected service only, current revision/traffic, and existing IAM/annotations.
3. Obtain explicit approval for the single-service update. The anticipated form is `gcloud run services update <exact-service> --region=us-central1 --project=sandman-combat-staging --no-invoker-iam-check`.
4. Independently read back the service and IAM policy. Prove no project-wide or multi-service grant was introduced.
5. Invoke through the Firebase callable protocol: unauthenticated requests must reach the callable boundary and return `unauthenticated`; authorized synthetic users must succeed only within existing role/location scope.
6. Record sanitized evidence as `CALLABLE_TRANSPORT:sandman-combat-staging:991554514268` for the reviewed deployment run. Never record tokens or credential values.

If the platform rejects the update, the service cannot be mapped exactly, or protocol tests do not produce the expected authorization results, the transport state remains unresolved and deployment must not proceed.

## Remaining blockers

- Separately authorize and prove the single-service callable transport mechanism.
- Verify/create and complete a restorable staging recovery checkpoint under separate authority.
- Capture fresh staging baselines and production-no-change evidence.
- Review and approve the exact Phase 4 commit and generated manifest/checksums.
- Separately authorize the first one-function deployment and cloud validation.

Removing Editor from the default Compute account remains outside this phase and must not occur until all dependent workloads are inventoried and migrated.
