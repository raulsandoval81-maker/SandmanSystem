# P0 authenticated staging acceptance

Dispatch **P0 authenticated staging acceptance** on `main` with
`confirm_project=sandman-combat-staging`. The job uses the existing protected
`staging` environment and stops at the first unsuccessful assertion. Use only
pre-existing synthetic fixtures. A missing fixture fails the run.

The protected environment supplies the existing `SANDMAN_STAGING_TEST_PASSWORD`
secret and a non-secret `SANDMAN_P0_STAGING_FIXTURES` JSON variable. The workflow
does not create accounts or fixtures. Configure the variable with these fields
before an approved dispatch:

| Field | Expected value |
| --- | --- |
| `roles.management`, `roles.coach`, `roles.parent`, `roles.athlete`, `roles.admin` | Each has `uid`, `email` and a CSS `readySelector` for a role-specific authenticated UI element. Use five distinct staging UIDs and reserved example-domain addresses. Each existing account must have the Firebase Auth claim `synthetic: true`. |
| `ownAthlete`, `otherAthlete` | Two distinct synthetic athlete document IDs. The Athlete owns the first and the Parent has an active link to it. The second belongs to another synthetic family. |
| `intake`, `proposal` | Existing linked synthetic Intake and proposal document IDs readable by Management, with `intakeStatus`, `proposalStatus`, and `paymentStatus` fields in the fixture variable specifying the expected states. |
| `xpLog`, `progressionField` | Existing synthetic XP log ID beneath the first athlete, plus one of `tier`, `rank`, `stripeCount`, or `progression` present on that athlete. |
| `storage` | Existing authorized fixture with `path` under `p0-synthetic/` ending in `.txt`, `role` naming an authorized synthetic account, and the file's lowercase `sha256`. Use a file of at most 4 KiB in the staging default bucket. |

Document IDs must begin with `staging-`. Firestore fixtures must carry
`synthetic: true`. Browser traffic is restricted to the staging site, Firebase
authentication, staging Firestore listeners, and static SDK assets. The runner
performs authenticated reads and access-denial assertions without invoking
payment, mail, or mutation callables. The enrollment, billing, XP, progression,
and Storage checks verify existing state and read permissions. End-to-end
creation, financial reconciliation, XP mutation, promotion, and Storage uploads
are outside this read-only workflow's coverage.

The artifact contains check names and outcomes. Keep credential values and
tokens in the protected job.
