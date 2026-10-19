# Mixed-Journey Tier Display Backfill

This is an owner-approved, staging-only repair for the 21 synthetic athletes created by the mixed-journey roster seed. It does not create athletes or write progression evidence.

## Fields added

Each target receives only:

- `tier`: the existing `syntheticScenarioTier` (`T0`–`T4`)
- `rank`: the canonical Road2Champion or Path2Legend display name
- `syntheticPlacement: true`
- `syntheticPlacementCertified: false`
- `syntheticPlacementSource: mixed-journey-scenario-tier-v1`

The script refuses records containing progression, curriculum, XP, stripe, verified-skill, testing, certificate, promotion-history, or progression-cycle evidence. It also refuses missing records, non-synthetic records, scenario drift, identity drift, and conflicting tier/rank values. The three historical fixtures are read and verified but never included in the write set.

## Owner-approved execution

Merge the reviewed PR to `main`, then dispatch the existing protected workflow:

```bash
gh workflow run seed-mixed-journey-staging-roster.yml \
  --ref main \
  -f operation=backfill-tier-display \
  -f confirm_project=sandman-combat-staging \
  -f confirm_seed=BACKFILL-21-SYNTHETIC-TIERS
```

Approve only the protected `staging` environment. Do not select `seed-roster`. The workflow runs boundary and regression tests before obtaining credentials, authenticates through the dedicated seed provider, verifies the staging Firestore project, and then invokes only `backfill-mixed-journey-tier-display-staging.mjs`.

Repeated execution is safe: already-correct documents are skipped, and the script reports how many documents changed.

## Check-In refresh

Coach Check-In loads athlete documents when the page starts. A page reload after the backfill refreshes the roster and makes the new `tier` and `rank` values available to display and HYBRID grouping. Attendance stores a check-in snapshot, so athletes already checked in before the backfill should be removed and re-added before attendance is submitted if the stored attendance snapshot must also contain the new values. Do not reopen, rewrite, or migrate an already submitted practice.

Verify with synthetic identities only:

1. Reload Coach Check-In for the staging practice.
2. Confirm 24 identities: 15 Road2Champion and 9 Path2Legend.
3. Confirm the 21 new records display their expected `T0`–`T4` tier and canonical rank.
4. Remove and re-add any athletes checked in before the backfill, while the attendance record remains editable.
5. Confirm mixed-tier groups retain individual tier labels and require Coach-controlled instructional focus.
6. Confirm no synthetic placement is shown as verified mastery or certification.

There is no production or Firebase deployment step. Rollback, if required, must be a separately reviewed staging-only removal of exactly the five display-placement fields from the 21 known IDs; do not rerun the create-only roster seed.
