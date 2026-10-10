# Sandman staging GitHub deployment

This design is staging-only. It targets Firebase project `sandman-combat-staging`
(project number `991554514268`) and refuses production project
`sandmandashboard`. The production Hosting workflow is unchanged.

## Workflow boundary

`.github/workflows/sandman-staging-preflight.yml` is manual-only, requires the
protected GitHub `staging` environment and an exact project-name confirmation,
and authenticates without a service-account key through:

- WIF provider `projects/991554514268/locations/global/workloadIdentityPools/sandman-github-staging/providers/sandman-github-actions`
- deployer `sandman-staging-deployer@sandman-combat-staging.iam.gserviceaccount.com`
- provider condition restricted to repository ID `1258739245`, owner ID
  `252659069`, repository `raulsandoval81-maker/SandmanSystem`, and environment
  `staging`

The workflow runs the Functions build/unit tests and staging-isolation tests
before authentication. It then verifies the generated external-account
credential and deploys only:

- Hosting site `sandman-combat-staging`, from ignored generated staging assets
- callable `skillCheckCoachCall` (Node.js 22, Cloud Functions v2, default
  `us-central1` region)
- Firestore rules for `projects/sandman-combat-staging/databases/(default)`

It intentionally does not deploy Storage rules, seed data, other Functions, or
any production resource.

## Required service enablement

The following APIs must be enabled in `sandman-combat-staging` by an existing
administrator before the workflow is approved to run:

- `cloudfunctions.googleapis.com`
- `cloudbuild.googleapis.com`
- `artifactregistry.googleapis.com`
- `run.googleapis.com`
- `compute.googleapis.com` (creates the default Compute service account used by
  this new project's default Cloud Build and Functions runtime path)

Firebase Hosting, Firebase Rules, Firestore, Storage, IAM Credentials, Security
Token Service, IAM, and Service Usage APIs are already enabled. The scoped
callable has no Eventarc, Scheduler, Pub/Sub, or Secret Manager trigger/runtime
requirement.

## Least-privilege grants to approve

Grant these roles only in `sandman-combat-staging`:

| Principal | Resource | Role | Reason |
| --- | --- | --- | --- |
| staging deployer | project | `roles/firebasehosting.admin` | Create a Hosting version/release for the existing staging site. Includes Firebase project/site discovery. |
| staging deployer | project | `roles/firebaserules.admin` | Create and release the checked-in Firestore ruleset. |
| staging deployer | project | `roles/cloudfunctions.developer` | Create/update the one selected Cloud Functions v2 callable and inspect its operation. |
| staging deployer | project | `roles/serviceusage.serviceUsageConsumer` | Use and inspect the already-enabled project services during Firebase CLI deployment; cannot enable services. |
| staging deployer | project | `roles/serviceusage.apiKeysViewer` | Firebase CLI requirement for reading the staging web API-key metadata; cannot modify keys. |
| staging deployer | service account `991554514268-compute@developer.gserviceaccount.com` | `roles/iam.serviceAccountUser` | Permit deployment to act as the Functions runtime/default build identity. Scope this to the service account, not the project. |
| Compute default service account | project | `roles/cloudbuild.builds.builder` | Execute the Functions source build and write its image/artifacts. The project is new and its effective Cloud Build constraints select the Compute default account. |
| Compute default service account | project | `roles/datastore.user` | Let `skillCheckCoachCall` read and transactionally update staging Firestore at runtime. |
| Compute default service account | project | `roles/logging.logWriter` | Let the deployed callable write runtime logs. |

The WIF principal already has `roles/iam.workloadIdentityUser` on the staging
deployer service account. Do not add `roles/iam.serviceAccountTokenCreator`,
project Editor/Owner, `roles/firebase.admin`, or any role in
`sandmandashboard`.

API activation creates Google-managed service agents. Keep their automatically
managed roles on their matching identities only:

- `service-991554514268@gcf-admin-robot.iam.gserviceaccount.com` —
  `roles/cloudfunctions.serviceAgent`
- `service-991554514268@gcp-sa-cloudbuild.iam.gserviceaccount.com` —
  `roles/cloudbuild.serviceAgent`
- `service-991554514268@serverless-robot-prod.iam.gserviceaccount.com` —
  `roles/run.serviceAgent`

Never grant these service-agent roles to the GitHub deployer.

## Remaining approval boundary

No roles or APIs are changed by this branch. After API activation, confirm the
default build identity with:

```sh
gcloud builds get-default-service-account --project=sandman-combat-staging
```

It must resolve to
`991554514268-compute@developer.gserviceaccount.com` before granting the
service-account-specific roles above or running the workflow. The GitHub
`staging` environment currently allows only the older
`pass6/wrestling-staging-activation` branch; add the PR #25 head branch to that
environment policy before a manual test, without weakening required review.
