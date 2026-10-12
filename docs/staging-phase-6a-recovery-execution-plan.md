# Staging Phase 6A: Recovery Checkpoint Execution Plan

Date: 2026-10-12

Status: **BLOCKED at the approval boundary.** No bucket, IAM binding, export, import, restore, database-setting change, or other cloud mutation was performed.

## Verified current state

Read-only revalidation used explicit `--project=sandman-combat-staging` targeting. The active account is `raulsandoval81@gmail.com`; the default CLI project was not used for targeting and was not changed.

- Project: `sandman-combat-staging` / `991554514268`, ACTIVE.
- Firestore: `(default)`, Native/Standard, `nam5`.
- PITR: disabled; delete protection: disabled; version retention: 3600 seconds.
- Backup schedules, backups, and import/export operations: none.
- Proposed bucket: `gs://sandman-combat-staging-firestore-backups`, confirmed absent with `404`.
- Firestore service agent binding: `service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com` has project role `roles/firestore.serviceAgent`.
- Operator binding: the active account has existing project `roles/owner`; no new role is proposed.
- Effective resource-location policy allows all values. Public-access-prevention and uniform-access constraints are not organization-enforced, so both must be explicitly configured and verified on the bucket.

Billing remains a blocker: the installed CLI lacks the optional beta billing command group, and Phase 6A did not install it. Direct service-account description also returned `iam.serviceAccounts.get` denied, although the project policy directly proves the service-agent principal and role. Billing status and the Import/Export page's “jobs run as” identity must be independently confirmed before provisioning/export.

## Location compatibility

The proposed bucket location is **`US` multi-region**, subject to explicit operator acceptance of cost and data-residency policy.

Google documents `nam5` as the United States Central multi-region with read/write replicas in `us-central1` and `us-central2` and a witness in `us-east1`. For multi-regional Firestore endpoints, Google maps `nam5` to `us`. Firestore export guidance requires a bucket in the same project and a location near the database; it does not identify `nam5` as a valid Cloud Storage bucket location. Cloud Storage supports `US` as a bucket multi-region. `US` is therefore the closest documented multi-region match and preserves regional-outage resilience better than selecting one replica region. This is an evidence-based proposal, not a claim that Firestore requires `US`.

Do not substitute `nam5`, `us-central1`, another bucket, or another project without a new review.

## Proposed bucket configuration

| Setting | Proposed value |
|---|---|
| Name | `sandman-combat-staging-firestore-backups` |
| Owning project | `sandman-combat-staging` / `991554514268` |
| Location | `US` multi-region |
| Default storage class | Standard |
| Uniform bucket-level access | Enabled at creation |
| Public access prevention | Enforced |
| Object versioning | Enabled |
| Retention policy | 30 days, initially unlocked |
| Lifecycle | Delete live objects after 45 days; delete noncurrent versions 30 days after becoming noncurrent |
| Requester Pays / Rapid | Forbidden |

The 30/45-day values are proposed defaults for the migration checkpoint, not settled business retention requirements. The operator must decide whether legal, insurance, incident-response, or migration timelines require longer retention. Do not lock the retention policy in this change; locking is irreversible. The reviewed lifecycle file is `scripts/staging/recovery-bucket-lifecycle.json`.

## Least-privilege design

Google states that same-project Firestore import/export workflows require no extra bucket permission change: the Firestore service agent can access same-project buckets by default. Therefore the smallest initial IAM change is **none**. After bucket creation, verify effective access and the Import/Export authorization identity before granting anything.

If that verification proves an explicit grant is required, stop and obtain the separate Stage C approval. The documented fallback is `roles/storage.admin` for the Firestore service agent on this bucket only. Never grant it at project scope. Do not use `allUsers`, `allAuthenticatedUsers`, a production principal, or the default Compute account. A narrower custom role may be designed later if Google-supported permission testing proves it sufficient; do not improvise one during execution.

Operator capabilities should be separated where practical:

- bucket creation: project-level `storage.buckets.create` plus project read permissions;
- configuration/IAM: bucket-level `storage.buckets.get`, `storage.buckets.update`, `storage.buckets.getIamPolicy`, and `storage.buckets.setIamPolicy` (a bucket-scoped Storage Admin grant after creation is the predefined option);
- export start/status: project `datastore.databases.export` and operation get/list (predefined `roles/datastore.importExportAdmin`);
- integrity verification: bucket-scoped `roles/storage.objectViewer` plus bucket metadata/IAM read permissions.

The current operator's existing Owner role appears to contain the needed permissions, but that pre-existing broad role must not be copied or granted to another principal. No key generation is needed.

## Auditable runbook

Every stage is a separate approval boundary. Commands below are proposals and were not run.

### A. Read-only preflight

Reconfirm account, project ID/number, database/location, billing, effective location policy, absence of the exact bucket, service-agent authorization identity, and current backups/operations. Record UTC timestamp and sanitized outputs. Any mismatch stops the procedure.

### B. Bucket provisioning — separate approval required

```sh
gcloud storage buckets create gs://sandman-combat-staging-firestore-backups \
  --project=sandman-combat-staging \
  --location=US \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access \
  --public-access-prevention

gcloud storage buckets update gs://sandman-combat-staging-firestore-backups \
  --project=sandman-combat-staging \
  --versioning \
  --retention-period=30d \
  --lifecycle-file=scripts/staging/recovery-bucket-lifecycle.json
```

Stop after creation/configuration. Read back owning project number, location, storage class, uniform access, public-access prevention, versioning, retention, lifecycle, soft-delete state, IAM, and absence of public/production/cross-project principals. Do not retry automatically or delete a partially configured bucket.

### C. IAM configuration — separate approval required

Expected action: no new binding if same-project service-agent access verifies successfully. If it does not, request approval for only this bucket-scoped fallback:

```sh
gcloud storage buckets add-iam-policy-binding \
  gs://sandman-combat-staging-firestore-backups \
  --project=sandman-combat-staging \
  --member=serviceAccount:service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com \
  --role=roles/storage.admin
```

Read back the policy and stop if any public, production, cross-project, or unexpected principal appears. Never grant project-wide Storage Admin.

### D. Export execution — separate approval required

Generate a fresh timestamp once, record it, and substitute it exactly once:

```sh
gcloud firestore export \
  gs://sandman-combat-staging-firestore-backups/runtime-migration/<YYYYMMDDTHHMMSSZ> \
  --database='(default)' \
  --project=sandman-combat-staging \
  --async
```

Record the returned operation ID. Do not start another export if output is delayed or ambiguous; query the recorded operation.

### E. Integrity verification — read-only after approved export

1. Describe the recorded Firestore operation until it reaches successful terminal state.
2. Verify its output URI is under the exact approved timestamped prefix.
3. List object names, sizes, generations, creation/update times, CRC32C/MD5 where supplied, retention/hold state, and the `.overall_export_metadata` plus collection-group metadata. Do not download document data.
4. Compare completed versus estimated entity/byte metrics where present; explain any discrepancy.
5. Re-read bucket ownership/configuration/IAM and confirm no drift.
6. Locate the authorized Firestore export audit event and record principal, operation, resource, and time without tokens or document content.
7. Preserve a sanitized evidence manifest and operation ID. A completed export is a checkpoint, not a tested restore.

### F. Restore-readiness review — documentation only

Prepare a separately approved rehearsal in a new, isolated non-production project/database with compatible Firestore mode/location, billing, indexes, TTL configuration, and bucket access. Estimate import writes/index storage and Cloud Storage/network costs. Import only from the verified `.overall_export_metadata` path. Confirm imports overwrite matching IDs, do not remove unrelated documents, do not restore index definitions, and can trigger snapshot listeners even though Cloud Functions are not triggered. Define synthetic validation without reading live athlete records. No rehearsal resource or import is authorized here.

## Costs, duration, and limitations

- Managed export bills one document read per exported document; exact cost is `document count × current nam5 read price`, plus Cloud Storage operation and US Standard storage charges. The document count was not read in Phase 6A, so no defensible numeric estimate is available.
- Import/rehearsal would bill document writes and index updates. Budget alerts may not fire until an export/import finishes.
- Export duration depends on data size, index/namespace shape, service capacity, and quota; no evidence supports a reliable duration estimate. Treat it as an asynchronous operation and monitor the operation metrics.
- An export is not an atomic snapshot at its start and may include writes made while it runs.
- Closing the CLI does not cancel an asynchronous operation. A cancelled export leaves partial, non-importable output.
- Export metadata does not contain index definitions. Import overwrites matching document IDs and leaves unrelated documents intact.
- Versioning, soft delete, retention, and lifecycle can extend storage duration and cost beyond the nominal 45-day live-object rule.

## Local validation

`scripts/staging/validate-recovery-checkpoint-plan.mjs` is validation-only and has no subprocess or cloud execution capability. It fixes the staging ID/number, database, bucket, `US` location, timestamp shape, draft retention/lifecycle, acknowledgement, and export destination. It rejects production, unknown/redirected buckets, wrong locations, missing acknowledgement, and all execute/create/export modes.

Executed results:

| Suite | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Functions TypeScript/unit/runtime identity | 60 | 0 | 0 |
| Staging isolation/readiness/hardening/recovery-plan safety | 30 | 0 | 0 |
| Firestore emulator integration | 76 | 0 | 0 |
| Firestore authority rules | 1 | 0 | 0 |
| **Total** | **167** | **0** | **0** |

Safe validation example:

```sh
SANDMAN_STAGING_PROJECT_ID=sandman-combat-staging \
SANDMAN_STAGING_PROJECT_NUMBER=991554514268 \
SANDMAN_RECOVERY_BUCKET=sandman-combat-staging-firestore-backups \
SANDMAN_RECOVERY_DATABASE='(default)' \
SANDMAN_RECOVERY_BUCKET_LOCATION=US \
SANDMAN_RECOVERY_ACK=VALIDATE_RECOVERY:sandman-combat-staging:991554514268 \
node scripts/staging/validate-recovery-checkpoint-plan.mjs \
  --validate --timestamp <YYYYMMDDTHHMMSSZ>
```

## Approval checklist and blockers

- [ ] Operator accepts `US` multi-region and confirms it satisfies organizational/data-residency requirements.
- [ ] Billing/Blaze status is independently verified.
- [ ] Operator chooses or changes the proposed 30-day retention and 45-day lifecycle values.
- [ ] Expected export size/document count and cost ceiling are approved without reading athlete contents.
- [ ] Firestore Import/Export page confirms jobs run as the stated service agent.
- [ ] Stage B bucket provisioning receives distinct explicit approval.
- [ ] Bucket read-back passes before any IAM action.
- [ ] Stage C receives distinct approval only if an explicit bucket binding is actually needed.
- [ ] Stage D export receives distinct explicit approval after bucket/IAM verification.
- [ ] A non-production restore-rehearsal design receives separate future approval.

Any failure stops the run. Preserve evidence, do not broaden IAM, do not switch projects, do not substitute a bucket, do not retry mutations automatically, and obtain separate approval for any deletion or cleanup.

## Evidence references

- [Firestore managed export/import requirements, service-agent behavior, limitations, and billing](https://docs.cloud.google.com/firestore/native/docs/manage-data/export-import)
- [Firestore `nam5` geography](https://docs.cloud.google.com/firestore/native/docs/locations)
- [Firestore regional endpoint mapping of `nam5` to `us`](https://docs.cloud.google.com/firestore/native/docs/regional-endpoints)
- [Cloud Storage bucket creation options](https://docs.cloud.google.com/storage/docs/creating-buckets)
- [Cloud Storage IAM roles and bucket-scoped access](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)
