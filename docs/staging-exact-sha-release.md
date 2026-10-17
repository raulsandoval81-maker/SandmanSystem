# Controlled exact-SHA staging release

This pathway deploys an application commit without merging that application commit to `main`. The workflow and release manifest remain trusted code on `main`; the application SHA is checked out into a separate directory and cannot replace authentication, authorization, preflight, or deployment commands.

The first approved entry is `hybrid-pr99-5ed90c5c`, bound to PR #99 commit `5ed90c5c8eb609e86319a5b5b188642764157dd8`. A future release requires a reviewed manifest change. Arbitrary workflow input cannot select a different source SHA or broaden the target list.

## Authorization model

- The workflow must be dispatched from `main` in the protected `staging` GitHub environment.
- Both jobs use the existing staging WIF provider.
- Hosting authenticates as `sandman-staging-deployer@...`.
- Functions authenticate as `sandman-practice-deployer@...`.
- Function deployment uses the dedicated `sandman-practice-deployer@...`; both existing callables retain their current Compute runtime identity. This release does not migrate runtime identity.
- Personal Google credentials are neither accepted nor referenced.

The checked-in function allowlist is exactly `savePracticeSessionMemory` and `closePracticeSession`. Hosting deploys separately and last. Firestore Rules, Storage Rules, other functions, seeding, IAM changes, and production are outside the workflow.

## Mandatory preflight

Validation mode performs no deployment. It verifies the immutable checkout, runs application and trusted-tooling tests, prepares isolated artifacts, reads only `stagingMetadata/wrestling-auto`, and snapshots the two affected Functions plus their Cloud Functions and Cloud Run IAM policies. The marker must identify `sandman-combat-staging`, `staging`, and `syntheticDataOnly: true`.

Each callable must exactly match the reviewed preflight contract: Gen 2, `us-central1`, Node.js 22, the existing Compute runtime identity, 256 MiB memory, one CPU, 60-second timeout, concurrency 80, maximum 20 instances, allow-all ingress, no secret environment variables, and the three recorded non-secret `SANDMAN_` environment values. Any mismatch stops both validation and deployment.

## Recovery checkpoints

- Hosting release `1792129695960000`
- Hosting version `f15fcbeecf3a7763`
- `savePracticeSessionMemory` source generation `1791696114389655`
- `savePracticeSessionMemory` source hash `a0afcbbc841e04604c023e7d0ad692f86ed436a3`

Before deployment, retain fresh descriptions for both affected Functions, including revision, source generation/hash, runtime identity, environment, labels, and traffic. Retain the current Hosting release/version. Recovery is a separately approved redeployment of the recorded prior artifact or Hosting version; this workflow never performs automatic rollback.

## Release actions

`validate` performs all immutable-source, application, marker, callable configuration, and IAM preflight checks without deployment. `deploy` repeats the same protected preflight, deploys only the two named Firebase callables and isolated staging Hosting, then verifies callable configuration and both IAM policies are unchanged. The generated function entry point sets Firebase `preserveExternalChanges`, retains the recorded non-secret environment, and verifies both exports remain Firebase callables before invoking the Firebase CLI.

The blocking code gate compiles Functions, runs focused HYBRID regression tests, and checks Session Builder syntax. The historical reconciliation test file is run separately and its result is reported as non-gating technical debt; a failure is **not** a passing result and unrelated regressions are not certified by this focused gate. Before enabling deploy, review the historical failure baseline and update the gate appropriately.

## Next acceptance sequence

1. Merge only this infrastructure PR after security review.
2. Confirm WIF bindings and protected-environment reviewers outside the repository.
3. Dispatch `Controlled exact-SHA staging release` from `main` with action `validate` and project confirmation `sandman-combat-staging`.
4. Confirm the synthetic marker, callable configuration, and IAM snapshots in the run evidence.
5. After the validation run succeeds and the protected `staging` environment reviewer approves, dispatch the same workflow with action `deploy` and the same project confirmation.
6. Record new revisions and Hosting version from the post-deployment artifact, then perform the PR #99 Coach-browser acceptance.
7. Do not merge PR #99 or deploy production as part of staging acceptance.
