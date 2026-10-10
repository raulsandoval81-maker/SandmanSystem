# Phase 5 staging execution record

## Source state

Phase 5 starts from Phase 4 commit `808fb79eac3f0f4356369d26b0fc98e1978a5b92`. Production Firebase configuration remains unchanged. The repository contains only the production alias `sandmandashboard`; no staging project alias, staging credential path, staging environment variable, or staging service-account file was available during this pass.

No remote Firebase project inventory was queried because doing so would use an unspecified logged-in account rather than the required dedicated staging identity. No cloud resource was created, no billing plan was changed, and no deployment or remote seed was attempted.

## Owner actions required before execution

1. Create or designate a completely separate Firebase project. Suggested ID: `sandman-wrestling-staging`, subject to availability.
2. Create its default Firestore database in the approved region, enable Authentication with Email/Password, register a Web App, create a Hosting site, and enable the Functions APIs.
3. Review and explicitly approve Firebase billing. Deploying Cloud Functions requires the project to use the Blaze plan; the owner must approve the billing account and any budget/alert policy before deployment.
4. Create a staging-only service account with only the roles required to deploy Hosting, Functions, Firestore rules, and Storage rules. Do not copy or reuse production credentials.
5. Provide the service-account JSON through an approved secret channel and record its exact email in `SANDMAN_STAGING_SERVICE_ACCOUNT_EMAIL`.
6. Set `SANDMAN_STAGING_PROJECT_ID`, `SANDMAN_STAGING_ACK`, `SANDMAN_STAGING_WEB_CONFIG`, `GOOGLE_APPLICATION_CREDENTIALS`, and a staging-only `SANDMAN_STAGING_TEST_PASSWORD`.
7. Immediately before an approved deployment, set `SANDMAN_STAGING_DEPLOY_CONFIRM=DEPLOY:<project-id>` and run only `node scripts/staging/deploy-staging.mjs`.
8. After deployment verification, separately authorize and run `node functions/scripts/seed-wrestling-staging.mjs`.

The deployment and seed are intentionally separate human-authorized operations. Neither is called by GitHub Actions or by repository tests.

## Synthetic fixture guarantees

The seed manifest contains two synthetic Coaches, three synthetic athletes, one family, a mixed-readiness open practice, canonical attendance, finalized historical practices, verified foundations, missing/stale/conflicting evidence scenarios, and an interrupted draft. Every exact top-level and nested Firestore path is read before mutation. Existing documents must carry `synthetic: true` or `syntheticDataOnly: true`. Existing Auth users must have the expected `.invalid` email and `synthetic` custom claim. New Auth users are deleted if the atomic Firestore batch fails.

Repeated runs reuse only marked synthetic IDs, do not create randomized duplicates, preserve `eligibleForAuto: false`, and never award XP.

## Acceptance status

- Source readiness: ready for review.
- Cloud ownership: blocked; no authorized project or credentials supplied.
- Remote deployment and seeding: not executed.
- Authenticated desktop/mobile acceptance: not executed.
- Production readiness: not evaluated by Phase 5 and remains NO-GO.
