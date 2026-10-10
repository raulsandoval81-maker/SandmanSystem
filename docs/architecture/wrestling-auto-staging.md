# Wrestling supervised AUTO staging

This staging path is intentionally separate from production project `sandmandashboard`. It must use a newly created Firebase project, its own default Firestore database, Authentication tenant/users, Hosting site, service account, and GitHub `staging` environment. A production Hosting preview channel is not acceptable.

## External setup boundary

An authorized Firebase owner must create the staging project, enable Blaze billing if Functions deployment requires it, create a Web app and Hosting site, enable Email/Password Authentication, and grant a staging-only deploy service account the minimum roles needed for Hosting, Functions, Firestore rules, and service-account use. No production credential may be copied.

Configure GitHub environment `staging` with required reviewers, variable `SANDMAN_STAGING_PROJECT_ID`, and secrets `FIREBASE_SERVICE_ACCOUNT_SANDMAN_STAGING`, `SANDMAN_STAGING_WEB_CONFIG`, and `SANDMAN_STAGING_TEST_PASSWORD`. Record the dedicated service-account email as `SANDMAN_STAGING_SERVICE_ACCOUNT_EMAIL`. The project ID must not be `sandmandashboard`.

## Guarded preparation

Set `SANDMAN_STAGING_PROJECT_ID` and set `SANDMAN_STAGING_ACK` to exactly the same value. Put the public Firebase Web App JSON in `SANDMAN_STAGING_WEB_CONFIG`, then run:

```sh
node scripts/staging/prepare-staging-hosting.mjs
```

The command creates ignored `.firebase-staging/public`, replaces only its runtime Firebase configuration, and adds a visible STAGING banner. It refuses the production project or mismatched configuration. For an explicitly authorized deployment, set `SANDMAN_STAGING_DEPLOY_CONFIRM` to `DEPLOY:<staging-project-id>` and run `node scripts/staging/deploy-staging.mjs`. That wrapper rechecks the credential, Web App project, acknowledgement, and explicit target immediately before invoking Firebase with `firebase.staging.json`. Do not invoke Firebase deployment directly.

After authorized staging deployment, seed synthetic records with staging-only Application Default Credentials:

```sh
node functions/scripts/seed-wrestling-staging.mjs
```

The seed command refuses production and requires the explicit acknowledgement, staging-only password, service-account email, and `GOOGLE_APPLICATION_CREDENTIALS` path. It verifies the credential file's actual project and service-account identities before initializing Firebase. Existing fixed-ID Auth or Firestore records must already be marked synthetic or the seed terminates before mutation. Never import production Auth or Firestore data.

The seed constructs its complete write manifest first, including nested athlete-session and verified-skill paths. It reads every intended document before creating Auth users. It then reads and validates the entire manifest again inside the same Firestore transaction that performs the writes, so a concurrent nonsynthetic replacement causes a transaction retry and rejection rather than an overwrite. A missing preflight result, reordered result, or existing non-synthetic document terminates the run. If the Firestore transaction fails after new synthetic Auth users are created, the seed attempts to remove those newly created users and reports every rollback failure. Firebase Auth and Firestore are separate services; this process reduces partial state but does not claim cross-service atomicity.

## Required validation

Use the two synthetic Coach accounts to verify authorized and rejected access. Exercise group loading, all 36 families, evidence reconciliation, mandatory-only readiness, nonblocking supporting skills, mixed tracks, adjustment, confirmation, practice attachment, delivery, retrieval, refresh/recovery, attendance finalization, and cross-practice rejection in authenticated desktop and mobile browser sessions. Record browser/version and evidence. Do not claim browser completion until this has been performed against the isolated project.
