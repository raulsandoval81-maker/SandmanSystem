# Controlled exact-SHA staging release

This pathway deploys an application commit without merging that application commit to `main`. The workflow and release manifest remain trusted code on `main`; the application SHA is checked out into a separate directory and cannot replace authentication, authorization, preflight, or deployment commands.

The first approved entry is `hybrid-pr99-5ed90c5c`, bound to PR #99 commit `5ed90c5c8eb609e86319a5b5b188642764157dd8`. A future release requires a reviewed manifest change. Arbitrary workflow input cannot select a different source SHA or broaden the target list.

## Authorization model

- The workflow must be dispatched from `main` in the protected `staging` GitHub environment.
- Both jobs use the existing staging WIF provider.
- Hosting authenticates as `sandman-staging-deployer@...`.
- Functions authenticate as `sandman-practice-deployer@...`.
- Function artifacts run as `sandman-practice-runtime@...` and build as `sandman-practice-build@...`.
- Personal Google credentials are neither accepted nor referenced.

The checked-in function allowlist is exactly `savePracticeSessionMemory` and `closePracticeSession`. Hosting deploys separately and last. Firestore Rules, Storage Rules, other functions, seeding, IAM changes, and production are outside the workflow.

## Mandatory preflight

Validation mode performs no deployment. It verifies the immutable checkout, runs application and trusted-tooling tests, prepares isolated artifacts, reads only `stagingMetadata/wrestling-auto`, and describes only the two affected functions. The marker must identify `sandman-combat-staging`, `staging`, and `syntheticDataOnly: true`.

The current recorded runtime is the Compute default account, while the approved target is the dedicated Practice runtime. Deployment is blocked unless the protected operator separately supplies:

`MIGRATE_RUNTIME:hybrid-pr99-5ed90c5c:sandman-combat-staging`

That confirmation authorizes the runtime transition only; it does not change IAM.

## Recovery checkpoints

- Hosting release `1792129695960000`
- Hosting version `f15fcbeecf3a7763`
- `savePracticeSessionMemory` source generation `1791696114389655`
- `savePracticeSessionMemory` source hash `a0afcbbc841e04604c023e7d0ad692f86ed436a3`

Before deployment, retain fresh descriptions for both affected Functions, including revision, source generation/hash, runtime identity, environment, labels, and traffic. Retain the current Hosting release/version. Recovery is a separately approved redeployment of the recorded prior artifact or Hosting version; this workflow never performs automatic rollback.

## Next acceptance sequence

1. Merge only this infrastructure PR after security review.
2. Confirm WIF bindings and protected-environment reviewers outside the repository.
3. Dispatch `Controlled exact-SHA staging release` from `main` with action `validate`.
4. Confirm marker and both runtime descriptions in the run evidence.
5. Approve the dedicated runtime transition separately if still required.
6. Dispatch the same manifest with action `deploy` and exact staging confirmation.
7. Record new revisions and Hosting version, then perform the PR #99 Coach-browser acceptance.
8. Do not merge PR #99 or deploy production as part of staging acceptance.
