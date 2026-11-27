# P0 authenticated staging acceptance

Dispatch **P0 authenticated staging acceptance** on `main` with
`confirm_project=sandman-combat-staging`. The job uses the existing protected
`staging` environment and stops at the first unsuccessful assertion. Use only
pre-existing synthetic fixtures. A missing fixture fails the run.

The protected environment supplies the existing `SANDMAN_STAGING_TEST_PASSWORD`
secret and a non-secret `SANDMAN_P0_STAGING_FIXTURES` JSON variable. The acceptance job
does not create accounts or fixtures. Configure the variable with these fields
before an approved dispatch:

| Field | Expected value |
| --- | --- |
| `roles.management`, `roles.coach`, `roles.parent`, `roles.athlete`, `roles.admin` | Each has `uid`, `email` and a CSS `readySelector` for a role-specific authenticated UI element. Use five distinct staging UIDs and reserved example-domain addresses. Each existing account must have the Firebase Auth claim `synthetic: true`. |
| `ownAthlete`, `otherAthlete` | Two distinct synthetic athlete document IDs. The Athlete owns the first and the Parent has an active link to it. The second belongs to another synthetic family. |
| `intake`, `proposal` | Existing linked synthetic Intake and proposal document IDs readable by Management, with `intakeStatus`, `proposalStatus`, and `paymentStatus` fields in the fixture variable specifying the expected states. |
| `xpLog`, `progressionField` | Existing synthetic XP log ID beneath the first athlete, plus one of `tier`, `rank`, `stripeCount`, or `progression` present on that athlete. |
Document IDs must begin with `staging-`. Firestore fixtures must carry
`synthetic: true`. The browser checks use authenticated reads and access-denial
assertions without invoking payment, mail, or mutation callables. Storage is
reported as pending and is independent of the Firestore result.

To generate the manifest, dispatch the existing protected mixed-journey
staging seed workflow on `main` using operation `seed-p0-acceptance`,
`confirm_project=sandman-combat-staging`, and
`confirm_seed=SEED-P0-SYNTHETIC-FIXTURES`. Use the successful
`p0-staging-fixtures` artifact to populate the protected staging variable.
Existing synthetic records are preserved. A conflicting record or unavailable
permission stops the operation. Do not retry a partial run.

After authenticated read checks, the acceptance job runs the existing prepaid
enrollment, athlete-lane and XP write suites against the candidate rules in the
local demo emulators with payment and email credentials blank. Live write flows
and Storage remain outside this workflow's coverage.

The artifact contains check names and outcomes. Keep credential values and
tokens in the protected job.

## Move 1 ownership acceptance

The full run also uses the pre-existing `staging-outsider-coach` synthetic Auth account
from the Wrestling staging seed. It signs in with the protected staging password,
verifies its active Coach staff record, and requires denial for both synthetic athletes.
The Athlete identity must be denied the unrelated athlete record. Browser assertions
check drawer navigation, direct URL aliases and remembered IDs on Home Base, Profile
and Arsenal. The unrelated record's synthetic display strings are used only in memory
to check the rendered page and are omitted from the result artifact.

For final acceptance, dispatch **P0 authenticated staging acceptance**
(`.github/workflows/p0-staging-acceptance.yml`) on `main` **after separate approval
to land the reviewed test changes**. Set `confirm_project=sandman-combat-staging`
and leave all diagnostic-only switches false. Use a new first-attempt run. The workflow
is restricted to `main` and the existing protected `staging` environment. Require a
successful job and all Move 1 assertions in `p0-acceptance-results.json`. An optional
navigation-only diagnostic can be run separately but does not replace full acceptance.

The isolated rules test is `tests/firestore/p0-athlete-ownership.rules.test.mjs`.
Run it against a loopback Firestore emulator at port 8081 with project ID
`demo-sandman-p0-athlete-ownership`. It loads the repository's staging containment
candidate and writes only disposable synthetic emulator fixtures.
