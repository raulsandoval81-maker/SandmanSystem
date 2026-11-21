# Earned-stripe decay protection — review notes

## Owner policy
Once an athlete earns a stripe or completes a rank, decay must not remove or delete that earned achievement. Inactivity deductions may only consume XP above the already-earned stripe floor. This is a newly clarified policy; do not infer it from older code.

## Changed scope
- Pure server-side `earnedStripeFloorPolicy.ts` calculates the floor from currently persisted stripe counters and current-tier issued `STRIPE_AWARD` recognition entries.
- `scheduledDecaySweep.ts` applies that floor to the existing F8 and F4/older balance update paths.
- Missing, invalid or inconsistent stripe evidence/cap is a **no-write** case (`SKIPPED_XP_AUTHORITY`); it does not silently assume zero earned stripes.
- Previously achieved tiers and `recognitionHistory` are not written by this change.

## Untouched policy
14-day warning; deductions at days 28, 35, then every 14 days; 25 XP per hit; 150-point freeze. Recovery remains two distinct verified combat practices, with both recovery practices earning no Combat XP. The owner is considering moving to one full practice, **but has not approved a change**.

## Limits / release gates
- The existing historical `stripeCount` can be derived from XP rather than immutable issuance. Recognition history is stronger evidence but not guaranteed complete on older athlete records. Hence invalid/ambiguous evidence fails closed.
- This PR does **not** retroactively restore missing stripes or reconcile historical records.
- This PR does **not** prove that all other Academy XP writers preserve earned milestone history. A separate read-only inventory of all stripe/recognition writers and historical restoration policy is required for the stronger global invariant.
- Requires clean Functions TypeScript build, focused regression tests (new `tests/functions/decay-earned-stripe-floor.test.mjs` plus existing decay suites), and guarded staging verification before any production action.
- No deployment, merge, database migration, recovery-policy change, or real athlete write authorized.
