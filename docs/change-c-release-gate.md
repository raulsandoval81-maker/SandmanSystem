# Change C release gate

Project: `sandman-combat-staging` (`991554514268`). This document prepares execution; it does not authorize cloud changes.

## Immutable lineage

The release branch must be a clean, linear descendant of PR #83 commit `aa67f1f2222bfd5df81174d32391cb20557e78cd`. The workflow checks out the exact reviewed 40-character SHA supplied at dispatch, rejects SHA drift and a dirty checkout, targets one function from its literal twelve-function choice list, and runs only in the protected `change-c-staging-canary` environment.

## Callable transport

All twelve functions use Firebase callable authentication and reject missing authentication before data access. Their intended transport is public reachability with authorization at the callable boundary. The smallest transport correction is one Cloud Run service at a time using `--no-invoker-iam-check`; do not create an `allUsers` binding and do not grant project-wide `roles/run.invoker`.

`configure-callable-transport.mjs` defaults to validation. A separately approved `--apply` updates exactly the selected allowlisted service. Deployment then requires exact evidence bound to project, project number, function, and transport mode:

`CALLABLE_TRANSPORT:sandman-combat-staging:991554514268:<function>:NO_INVOKER_IAM_CHECK`

For the first canary, independently prove `getpracticesession` has `run.googleapis.com/invoker-iam-disabled=true`, unchanged IAM bindings, and expected callable-protocol rejection/success before dispatching deployment. Rollback is the same service only with `--invoker-iam-check`.

## First-canary minimum IAM

For `getPracticeSession` only:

- runtime `sandman-practice-runtime@...`: custom Firestore role containing only `datastore.databases.get`, `datastore.databases.getMetadata`, `datastore.entities.create`, `datastore.entities.get`, `datastore.entities.list`, and `datastore.entities.update`, conditioned to `projects/sandman-combat-staging/databases/(default)`;
- build `sandman-practice-build@...`: `roles/logging.logWriter`; conditional `roles/storage.objectViewer` for objects under `gcf-v2-sources-991554514268-us-central1`; `roles/artifactregistry.writer` on `us-central1/gcf-artifacts`;
- deployer `sandman-practice-deployer@...`: `roles/cloudfunctions.developer`, `roles/serviceusage.serviceUsageConsumer`, plus `roles/iam.serviceAccountUser` only on the matching Practice runtime and build accounts;
- transport operator: only `run.services.get` and `run.services.update`, conditioned to the exact `getpracticesession` service, if the approved executing identity does not already have them.

No Editor, Owner, Token Creator, project-wide Service Account User, project-wide Run Invoker, Auth Admin, Firestore data role for the deployer, Hosting Admin, or Rules Admin is required.

## Dependency-aware order

Each item is a separate checkpoint and rollback boundary:

1. `getPracticeSession`
2. `getPracticeAttendanceReview`
3. `createOrRecoverCanonicalPractice`
4. `openPracticeSession`
5. `savePracticeSessionMemory`
6. `saveDailyPracticeLog`
7. `updatePracticeCheckIn`
8. `finalizePracticeAttendance`
9. `savePracticeAthleteInput`
10. `closePracticeSession`
11. `completePracticeDailyGrind`
12. `skillCheckCoachCall`

Do not advance unless identity, transport, authorization, expected synthetic-only data behavior, logs, and rollback evidence pass for the current function.

## Rollback inventory requirements

Before the first execution retain checksummed evidence for: all twelve Function descriptions and source generations; all twelve Run revisions, traffic, service accounts, annotations and IAM policies; the live Firestore rules release/ruleset identifier and source hash; the Hosting live release/version identifier; and the successful Firestore export operation/destination. Retain the prior function source object generation and revision for each per-function rollback. Firestore Rules and Hosting are not deployed by the Change C workflow.
