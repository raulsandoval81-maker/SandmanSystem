# Proposed Change A: Staging Recovery Checkpoint

Status: **BLOCKED — explicit staged approvals are required.** This document does not authorize or execute the change. The detailed Phase 6A runbook is `docs/staging-phase-6a-recovery-execution-plan.md`.

## Current evidence

As observed on 2026-10-12, Firestore database `(default)` is Native mode in `nam5`. PITR and delete protection are disabled, retention is one hour, and no backup schedules or backups exist. `gs://sandman-combat-staging-firestore-backups` returns `404` and is not present in the staging project's bucket inventory.

## Required bucket

Create only after approval:

- exact name `sandman-combat-staging-firestore-backups`;
- owned by project `sandman-combat-staging` / `991554514268`;
- proposed location `US` multi-region, selected from current documented geography for `nam5` and subject to operator data-residency/cost approval;
- Standard storage, not Requester Pays or Rapid;
- uniform bucket-level access enabled and public access prevention enforced;
- object versioning enabled;
- proposed unlocked 30-day retention and lifecycle deletion at 45 days for live objects plus 30 days for noncurrent versions, subject to an operator retention decision;
- no production principal, cross-project writer, public member, or broad legacy ACL;
- least-privilege access for the staging Firestore service agent and separately approved recovery operators.

Before creation, confirm billing, organization policy, final retention period, expected export volume, recovery-time objective, recovery-point objective, and legal retention needs.

## Required permissions

The approving operator needs the minimum bucket-creation/configuration permissions and Firestore export permission. The Firestore service agent `service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com` has `roles/firestore.serviceAgent`. Current Google documentation says same-project export workflows need no extra bucket permission change, so no IAM grant is initially proposed. If post-creation verification proves otherwise, stop and separately approve only a bucket-scoped `roles/storage.admin` fallback. Never grant project-wide Storage Admin or add a production identity.

## Proposed export

After the bucket is independently verified, request a separate execution approval for exactly:

```sh
gcloud firestore export \
  gs://sandman-combat-staging-firestore-backups/runtime-migration/<UTC_TIMESTAMP> \
  --database='(default)' \
  --project=sandman-combat-staging \
  --async
```

No export was started in Phase 5 or Phase 6A.

## Completion evidence

Record the operation name, start/end timestamps, successful terminal state, output URI prefix, estimated/completed entities and bytes, database/project identity, and audit-log event. Verify that the `.overall_export_metadata` file and expected namespace metadata exist without reading athlete document contents. Re-read bucket ownership, location, retention, lifecycle, versioning, public-access prevention, and IAM after completion.

Recovery readiness additionally requires a separately reviewed import plan, index compatibility review, non-production restore rehearsal destination, selective-versus-full import decision, authorized rollback owner, and documented handling of imports overwriting matching document IDs. A completed export is not proof that restoration works.

## Cost and limitations

Managed exports bill one document read per exported document; stored output incurs Cloud Storage charges. Imports bill document writes and index updates. Export/import usage may appear only after completion and may not trigger budget alerts during the operation. An export is not an atomic snapshot at its start time and can include concurrent changes. A cancelled export leaves partial objects that cannot be imported.

Approval must independently cover bucket creation/configuration, any proven-necessary IAM binding, export cost/execution, and later restore testing. None is included in the Phase 6A planning approval.
