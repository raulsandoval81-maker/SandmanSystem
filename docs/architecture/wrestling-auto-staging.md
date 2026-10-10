# Wrestling supervised AUTO staging

This staging path is intentionally separate from production project `sandmandashboard`. It must use a newly created Firebase project, its own default Firestore database, Authentication tenant/users, Hosting site, service account, and GitHub `staging` environment. A production Hosting preview channel is not acceptable.

## External setup boundary

An authorized Firebase owner must create the staging project, enable Blaze billing if Functions deployment requires it, create a Web app and Hosting site, enable Email/Password Authentication, and grant a staging-only deploy service account the minimum roles needed for Hosting, Functions, Firestore rules, and service-account use. No production credential may be copied.

Configure GitHub environment `staging` with required reviewers, variable `SANDMAN_STAGING_PROJECT_ID`, and secrets `FIREBASE_SERVICE_ACCOUNT_SANDMAN_STAGING`, `SANDMAN_STAGING_WEB_CONFIG`, and `SANDMAN_STAGING_TEST_PASSWORD`. The project ID must not be `sandmandashboard`.

## Guarded preparation

Set `SANDMAN_STAGING_PROJECT_ID` and set `SANDMAN_STAGING_ACK` to exactly the same value. Put the public Firebase Web App JSON in `SANDMAN_STAGING_WEB_CONFIG`, then run:

```sh
node scripts/staging/prepare-staging-hosting.mjs
```

The command creates ignored `.firebase-staging/public`, replaces only its runtime Firebase configuration, and adds a visible STAGING banner. It refuses the production project or mismatched configuration. Deploy only with `firebase.staging.json` and an explicit staging project ID.

After authorized staging deployment, seed synthetic records with staging-only Application Default Credentials:

```sh
node functions/scripts/seed-wrestling-staging.mjs
```

The seed command refuses production and requires the explicit acknowledgement and a staging-only password. Never import production Auth or Firestore data.

## Required validation

Use the two synthetic Coach accounts to verify authorized and rejected access. Exercise group loading, all 36 families, evidence reconciliation, mandatory-only readiness, nonblocking supporting skills, mixed tracks, adjustment, confirmation, practice attachment, delivery, retrieval, refresh/recovery, attendance finalization, and cross-practice rejection in authenticated desktop and mobile browser sessions. Record browser/version and evidence. Do not claim browser completion until this has been performed against the isolated project.
