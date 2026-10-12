# Staging Phase 6C: Provisioning Prerequisites

Date: 2026-10-12

Status: **CONDITIONAL — stopped before CLI repair and cloud provisioning.** No package installation, CLI repair, bucket creation, export/import, IAM change, database/application change, deployment, merge, production access, canary, or AUTO action occurred.

## Accepted policy

The operator approved the following policy for planning only:

| Setting | Accepted value |
|---|---|
| Project | `sandman-combat-staging` / `991554514268` |
| Bucket | `sandman-combat-staging-firestore-backups` |
| Location / class | `US` multi-region / Standard |
| Uniform bucket-level access | Enabled |
| Public access prevention | Enforced |
| Object versioning | Enabled |
| Minimum retention | 30 days, unlocked |
| Live-object lifecycle deletion | 45 days |
| Noncurrent-version deletion | 30 days after becoming noncurrent |
| Soft delete | 7 days |
| Initial export ceiling | USD 1 |
| Recurring export | None |

These approvals do not authorize CLI installation/repair, bucket provisioning, IAM changes, or export execution.

## Local gcloud diagnosis

The failure is reproducible before any Storage request is sent:

```text
Google Cloud SDK 588.0.0
Homebrew cask gcloud-cli 588.0.0
managed Python 3.14.8 / OpenSSL 4.0.3
gcloud storage --help -> CommandLoadFailure: module 'ssl' has no attribute 'PROTOCOL_TLSv1'
```

Python 3.14 no longer exposes `ssl.PROTOCOL_TLSv1`, but the installed gcloud-bundled `third_party/urllib3/contrib/pyopenssl.py` references it while loading Storage commands. The installed managed environment also contains `pyOpenSSL 26.0.0`, which causes that integration path to load. Core gcloud command groups work; the Storage command group does not.

This is an installation/dependency compatibility failure, not a cloud IAM, bucket, certificate, or project-selection failure. `gcloud storage --help` performs no cloud mutation and currently fails before help can load.

## Supported repair procedure — not authorized or performed

Google's Homebrew installation page identifies the supported Homebrew installation path and the gcloud component update path. Google's startup documentation says Python 3.10–3.15 is supported but explicitly excludes `CLOUDSDK_PYTHON` overrides for Homebrew installations. Therefore do not substitute the macOS system Python, edit bundled urllib3, fabricate `ssl.PROTOCOL_TLSv1`, enable TLS 1.0, disable certificate verification, or use `gsutil` as a bypass.

After separate operator permission, use this staged repair:

1. Record `gcloud version`, `brew list --versions --cask gcloud-cli`, active account, active configuration, and configuration directory. Do not print tokens or credentials.
2. Run the least disruptive supported update first: `gcloud components update`. If the Homebrew-managed installation refuses component updates or Storage remains broken, stop and use the Homebrew cask repair path: `brew update`, then `brew reinstall --cask gcloud-cli` (or `brew upgrade --cask gcloud-cli` if Homebrew reports a newer cask).
3. Preserve `~/.config/gcloud`; do not delete credentials or run `gcloud init` unless authentication was actually lost. Reauthentication, if needed, is a separate operator interaction.
4. Verify locally: `gcloud version`, `gcloud info --run-diagnostics`, and `gcloud storage --help`. Success requires the help command to exit zero without the Python/TLS exception.
5. Reconfirm the active account and explicitly target `sandman-combat-staging` for all later read-only checks. Do not change the global default from production merely to perform staging work.
6. Stop. A repaired CLI does not authorize bucket creation or export.

If local repair is declined, Google Cloud Shell is a supported future execution environment, but selecting it also does not authorize a cloud mutation.

## Console verification of Import/Export identity

Google documents this identity as a Console read-back:

1. Sign in to Google Cloud Console with the authorized operator account.
2. Use the project selector to choose exact project **Sandman Combat Staging** (`sandman-combat-staging`, number `991554514268`). If the selector shows `sandmandashboard`, stop without navigating further.
3. Open **Firestore → Databases**.
4. Select database **`(default)`** and confirm location **`nam5`**.
5. In the database navigation, open **Import/Export**. Do not click Import, Export, migration, or permission-fix actions.
6. Read the value next to **Import/Export jobs run as**.
7. Required exact value: `service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com`.
8. Capture a timestamped screenshot or operator attestation containing project ID, database, and the principal, while excluding unrelated account details. Record PASS only on an exact match.

Stop on any legacy App Engine identity such as `sandman-combat-staging@appspot.gserviceaccount.com`, the default Compute identity, production identity, missing field, or access error. Do not click **Check Bucket Status**, **Fix**, or **Migrate**, because those may begin a state-changing workflow. No API used in Phase 6B exposed this console-only field.

## Expected principal and IAM posture

Expected and project-bound principal:

`service-991554514268@gcp-sa-firestore.iam.gserviceaccount.com`

Phase 6B verified its project-level `roles/firestore.serviceAgent` binding and the role's relevant Storage permissions. Google states same-project import/export workflows require no permission changes. The initial IAM plan remains **no new binding**. Any failure after future bucket creation must stop for a new, bucket-scoped IAM review; project-wide Storage Admin remains forbidden.

## Current blockers and next authorization boundary

1. **CLI repair authorization:** not granted. The operator must separately authorize the staged update/reinstall procedure above. After repair, `gcloud storage --help` must pass.
2. **Console identity evidence:** not yet captured. The operator must perform or authorize an authenticated read-only Console inspection and confirm the exact principal.
3. **Bucket provisioning authorization:** expressly not granted. Even after the first two checks pass, a distinct instruction must authorize creation/configuration of only the accepted staging bucket.

The policy questions from Phase 6B are resolved: soft delete is 7 days, the one-export ceiling is USD 1, and there is no recurring schedule. The next action is CLI repair only after separate permission; it is not bucket provisioning.

## Evidence references

- [Google Cloud CLI Homebrew installation and update](https://docs.cloud.google.com/sdk/docs/downloads-homebrew)
- [gcloud supported Python startup configuration](https://docs.cloud.google.com/sdk/gcloud/reference/topic/startup)
- [Firestore service-agent and Console jobs-run-as verification](https://docs.cloud.google.com/firestore/native/docs/manage-data/export-import)
- [Cloud Storage soft delete](https://docs.cloud.google.com/storage/docs/soft-delete)
