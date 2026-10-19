# Mixed-Journey Seed WIF Owner Plan

This plan creates one staging-only trust path for the existing 24-athlete synthetic roster seed. It does not modify the Change C or exact-SHA release providers, grant project roles, deploy code, or write Firestore data.

## Approved boundary

- Project: `sandman-combat-staging` (`991554514268`)
- Pool: `sandman-github-staging`
- New provider: `sandman-mixed-journey-seed`
- Service account: `sandman-staging-deployer@sandman-combat-staging.iam.gserviceaccount.com`
- Repository: `raulsandoval81-maker/SandmanSystem`
- Environment: `staging`
- Ref: `refs/heads/main`
- Workflow: `.github/workflows/seed-mixed-journey-staging-roster.yml`
- Event: `workflow_dispatch`

The existing `sandman-github-actions` and `sandman-hybrid-staging` providers must remain unchanged.

## Owner-approved creation

Run these commands only after this PR is merged and explicit infrastructure approval is recorded:

```bash
gcloud iam workload-identity-pools providers create-oidc sandman-mixed-journey-seed \
  --project=sandman-combat-staging \
  --location=global \
  --workload-identity-pool=sandman-github-staging \
  --display-name="Sandman mixed-journey staging seed" \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject="seed24:" + assertion.sub,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref,attribute.event_name=assertion.event_name' \
  --attribute-condition="assertion.sub == 'repo:raulsandoval81-maker/SandmanSystem:environment:staging' && assertion.repository == 'raulsandoval81-maker/SandmanSystem' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'raulsandoval81-maker/SandmanSystem/.github/workflows/seed-mixed-journey-staging-roster.yml@refs/heads/main' && assertion.event_name == 'workflow_dispatch'"

gcloud iam service-accounts add-iam-policy-binding \
  sandman-staging-deployer@sandman-combat-staging.iam.gserviceaccount.com \
  --project=sandman-combat-staging \
  --role=roles/iam.workloadIdentityUser \
  --member='principal://iam.googleapis.com/projects/991554514268/locations/global/workloadIdentityPools/sandman-github-staging/subject/seed24:repo:raulsandoval81-maker/SandmanSystem:environment:staging'
```

Do not grant `roles/owner`, `roles/editor`, or `roles/iam.serviceAccountTokenCreator`. The deployer's existing staging project roles are unchanged.

## Verification before any seed run

```bash
gcloud iam workload-identity-pools providers describe sandman-mixed-journey-seed \
  --project=sandman-combat-staging \
  --location=global \
  --workload-identity-pool=sandman-github-staging \
  --format='yaml(name,state,attributeMapping,attributeCondition,oidc.issuerUri)'

gcloud iam service-accounts get-iam-policy \
  sandman-staging-deployer@sandman-combat-staging.iam.gserviceaccount.com \
  --project=sandman-combat-staging \
  --format=json
```

Confirm the provider is active, every claim restriction exactly matches the approved boundary, and the service-account policy contains only the exact new subject binding. Then merge this workflow correction and use the repository's protected `staging` environment approval to dispatch:

```bash
gh workflow run seed-mixed-journey-staging-roster.yml \
  --ref main \
  -f confirm_project=sandman-combat-staging \
  -f confirm_seed=SEED-24-SYNTHETIC-WRESTLERS
```

The first approved run is the authentication and seed execution. Do not retry a failed run until its logs establish whether any write step began; the seed's transaction and collision checks remain authoritative.

## Rollback

```bash
gcloud iam service-accounts remove-iam-policy-binding \
  sandman-staging-deployer@sandman-combat-staging.iam.gserviceaccount.com \
  --project=sandman-combat-staging \
  --role=roles/iam.workloadIdentityUser \
  --member='principal://iam.googleapis.com/projects/991554514268/locations/global/workloadIdentityPools/sandman-github-staging/subject/seed24:repo:raulsandoval81-maker/SandmanSystem:environment:staging'

gcloud iam workload-identity-pools providers delete sandman-mixed-journey-seed \
  --project=sandman-combat-staging \
  --location=global \
  --workload-identity-pool=sandman-github-staging
```

Rollback removes only this workflow's impersonation path. It does not alter the deployer's project roles, the pool, Change C, the exact-SHA release path, staging data, or production.
