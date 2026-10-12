# Staging Phase 6B: Read-Only Operator Verification and Cost Assessment

Date: 2026-10-12

Status: **CONDITIONAL — stop at the bucket-provisioning approval boundary.** Phase 6B performed documentation, local validation, and read-only cloud inspection only. It did not create a bucket, change billing or IAM, read athlete documents, start an export/import, deploy, merge, activate AUTO, or begin a canary.

Phase 6C subsequently accepted, for planning only, a USD 1 initial-export ceiling, 7-day soft delete, and no recurring schedule. See `docs/staging-phase-6c-provisioning-prerequisites.md`; CLI repair and provisioning remain unauthorized.

## Decision summary

| Check | Result | Evidence |
|---|---|---|
| Cloud Billing | **VERIFIED** | `projects/sandman-combat-staging/billingInfo` reported `billingEnabled: true`; the linked billing account reported `open: true` and USD currency. The billing-account identifier is intentionally omitted from this report. |
| Firebase / Blaze | **VERIFIED** | Firebase CLI listed project `sandman-combat-staging` / `991554514268` as ACTIVE with `firebase: enabled`. Firebase documents that linking a Cloud Billing account automatically upgrades a Firebase project to Blaze. |
| Database | **VERIFIED** | `(default)` is Firestore Native, Standard edition, `nam5`; PITR and delete protection remain disabled. Its `freeTier: true` field means this is the project's free-quota-eligible default database; it does not contradict project-level Blaze status. |
| Aggregate storage | **VERIFIED** | Cloud Monitoring metric `firestore.googleapis.com/storage/data_and_index_storage_bytes` returned **109,569 bytes** at 2026-10-12T19:29:00Z for only `(default)` in `sandman-combat-staging`, `nam5`. This metric contains no document fields or records. |
| Document count | **UNAVAILABLE WITHOUT DATA QUERY** | Google publishes storage and operation metrics but no current stored-document-count metric. No collection listing, aggregation query, export, or athlete-document read was executed. |
| Import/export principal | **CONDITIONALLY VERIFIED** | The expected principal is `service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com`; project IAM binds it to `roles/firestore.serviceAgent`, whose current permissions include bucket get and object create/delete/get/list. Exact console-only “Import/Export jobs run as” read-back remains required. |
| Same-project bucket IAM | **READY BY DOCUMENTED DEFAULT** | Google states same-project import/export workflows need no permission changes and the Firestore service agent can access the bucket by default. No IAM grant is initially required. |
| Local Storage CLI | **NOT READY** | `gcloud storage --help` crashes before command execution because Python 3.14 has no `ssl.PROTOCOL_TLSv1`, while the installed gcloud-bundled `urllib3/contrib/pyopenssl.py` imports it. Core read-only gcloud commands remain functional. |

## Billing and Blaze evidence

The installed GA command `gcloud billing projects describe sandman-combat-staging` worked without installing an optional component and returned billing enabled. A separate read-only billing-account description returned `open: true`. The Firebase CLI independently proved this is an ACTIVE Firebase project. Firebase's pricing-plan documentation says Firebase and Google Cloud share project billing, and linking Cloud Billing automatically upgrades the Firebase project to Blaze. Billing and Blaze are therefore verified.

No billing configuration, account association, budget, or secret was changed. No credential or token value was printed or stored.

## Metrics and cost assessment

### What is known

- Current Firestore data plus index storage: **109,569 bytes**, or approximately **0.00010205 GiB**.
- Current Standard-edition `nam5` document-read list price: **USD 0.03 per 100,000 documents** beyond free quota.
- A managed export incurs one document read per exported document. Those reads do not appear in the console usage section.
- Current US multi-region Standard Cloud Storage list price: **USD 0.000035616/GiB-hour**, approximately **USD 0.026/GiB-month** using 730 hours.
- Current US multi-region default replication charge is **USD 0.02/GB written**; Standard Class A operations are **USD 0.01 per 1,000 operations**. Exact export object and operation counts are unknown.

### What cannot be known without crossing the boundary

There is no current-document-count Cloud Monitoring metric. A collection scan or aggregation count would be a Firestore data query and could itself incur reads. Phase 6B did not query athlete or other application collections. Therefore the defensible export-read estimate remains:

`document count × USD 0.03 / 100,000`, reduced by any applicable daily free read quota at billing time.

Do not treat storage bytes as a document count. The 109,569-byte metric includes indexes, while managed export output excludes index definitions and adds export-format metadata; it is only a scale proxy, not a predicted object size.

### Storage scenarios using the current metric as a scale proxy

| Scenario | Approximate US Standard storage charge |
|---|---:|
| One current-size copy held for one month | USD 0.00000265/month |
| One current-size copy retained for 45 days | USD 0.00000398 total |
| Monthly exports, steady state at about 1.5 retained copies | USD 0.00000398/month |
| Weekly exports, steady state at about 6.4 retained copies | USD 0.000017/month |

These figures exclude serialization variance, future database growth, object/replication operations, noncurrent versions, soft-deleted objects, retries, and taxes. No export cadence was accepted, so the monthly values are scenarios rather than a forecast.

### Recommended operator ceiling

Approve a **USD 1 ceiling for one initial export and its first 45 days of storage**, with no automatic retry and no recurring schedule. This is deliberately conservative relative to the observed 109,569-byte scale and current list prices, but it is not a guarantee because the document count is unavailable. Stop before execution if a console estimate, billing calculator, database growth, changed prices, or any newly available count suggests the ceiling could be exceeded. Recurring exports require a separate cadence and budget decision.

## Authorization identity and IAM readiness

Confirmed project policy evidence:

- principal: `service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com`;
- binding: `roles/firestore.serviceAgent` at project scope;
- included relevant permissions observed from the GA role definition: `storage.buckets.get`, `storage.objects.create`, `storage.objects.delete`, `storage.objects.get`, and `storage.objects.list`;
- effective `constraints/firestore.requireP4SAforImportExport` policy is not enforced at this project; this neither changes nor disproves the observed principal binding;
- the proposed bucket is in the same staging project.

Google's current documentation identifies the Firestore service agent as the authorization identity and says same-project workflows require no bucket permission change. However, Google exposes the authoritative migration/current identity as the console's **Import/Export jobs run as** field. Before provisioning, an operator must capture that field for `(default)` and confirm the exact principal above, with no legacy App Engine account.

Initial bucket IAM action: **none**. After a separately approved bucket creation, read back effective access. Only if that fails should a new approval consider a binding on this exact bucket. The documented fallback is bucket-scoped `roles/storage.admin`; never grant it project-wide, never use the Compute runtime account, and never add production, public, or cross-project principals.

## Local CLI diagnosis and secure remediation

Observed installation:

- Google Cloud SDK `588.0.0`, Homebrew cask, rapid channel;
- managed virtual environment Python `3.14.8`, OpenSSL `4.0.3`;
- Python 3.14 reports no `ssl.PROTOCOL_TLSv1`;
- gcloud's bundled `third_party/urllib3/contrib/pyopenssl.py` references `ssl.PROTOCOL_TLSv1` at import time;
- installed `pyOpenSSL 26.0.0` and `cryptography 46.0.7` cause the pyOpenSSL integration path to load;
- macOS system Python `3.9.6` cannot be substituted because this gcloud release requires Python 3.10–3.15; Google also states `CLOUDSDK_PYTHON` substitution is unsupported for Homebrew installations.

Supported remediation: before any approved mutation, update or cleanly reinstall the Homebrew `gcloud-cli` package so its Google-managed Python environment and bundled dependencies are internally compatible, then verify `gcloud version`, `gcloud info --run-diagnostics`, and `gcloud storage --help`. Preserve the existing configuration directory and verify account/project explicitly after repair; do not run `gcloud init` unless authentication is actually lost. A supported Cloud Shell session is the non-local alternative for a future approved execution.

Do not monkey-patch `ssl`, re-enable TLS 1.0, disable certificate verification, edit bundled libraries, inject an unsupported interpreter, or use the legacy `gsutil` path as an unreviewed workaround. No remediation or installation occurred in Phase 6B.

## Location and retention review

The accepted **US multi-region / Standard / UBLA / public-access-prevention / versioning / unlocked 30-day retention / 45-day live deletion / 30-day noncurrent deletion** plan remains appropriate for a staging recovery checkpoint. `US` remains the closest documented multi-region match to Firestore `nam5`, and Standard has no provider minimum-storage-duration charge.

One setting remains unspecified: Cloud Storage soft delete. A new bucket can have a default soft-delete policy, which can retain deleted live or noncurrent objects beyond lifecycle deletion and add cost. The operator must explicitly accept a chosen soft-delete duration or separately authorize disabling it; the eventual create/read-back plan must include that exact value. Retention must remain unlocked.

## Exact prerequisites for separately authorizing provisioning

1. Capture the `(default)` Import/Export page's **jobs run as** value and match the exact Firestore service agent above.
2. Repair/reinstall the local Homebrew gcloud CLI and prove `gcloud storage --help` works, or explicitly choose supported Cloud Shell for execution.
3. Decide the bucket soft-delete duration; preserve all already accepted settings and keep retention unlocked.
4. Accept the USD 1 one-export/45-day ceiling, no automatic retry, and no recurring schedule.
5. Revalidate immediately before execution: active account, explicit staging ID/number, open billing, Firebase ACTIVE, database/location, bucket absence, organization policies, and current prices/aggregate storage.
6. Issue a new, explicit authorization for **bucket provisioning only**. It must not authorize IAM fallback, export/import, deploy, merge, production access, canary, or AUTO.
7. After creation, stop and read back ownership, location, class, UBLA, PAP, versioning, retention lock/state, lifecycle, soft delete, requester-pays/Rapid exclusions, IAM, and absence of production/public/cross-project principals.

## Read-only validation artifact

`scripts/staging/validate-phase-6b-readiness.mjs` only calculates an assessment from supplied evidence. It fixes staging project/bucket/service-agent identities, preserves unknown document counts as `null`, calculates costs only when supported inputs exist, and rejects execute/provision/export/import modes. It has no cloud client or subprocess capability.

## Evidence references

- [Firebase pricing plans and automatic Blaze upgrade on Cloud Billing linkage](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firestore managed export billing and service-agent behavior](https://docs.cloud.google.com/firestore/native/docs/manage-data/export-import)
- [Firestore Standard pricing for `nam5`](https://cloud.google.com/firestore/pricing)
- [Firestore Cloud Monitoring metric definitions](https://docs.cloud.google.com/monitoring/api/metrics_gcp_d_h)
- [Cloud Storage US multi-region pricing](https://cloud.google.com/storage/pricing)
- [gcloud Python startup support](https://docs.cloud.google.com/sdk/gcloud/reference/topic/startup)
- [Homebrew gcloud installation and update path](https://docs.cloud.google.com/sdk/docs/downloads-homebrew)
