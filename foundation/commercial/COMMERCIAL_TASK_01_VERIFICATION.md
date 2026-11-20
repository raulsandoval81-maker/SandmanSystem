# Commercial Task 01 verification

Verified on 2026-11-20 against `021eddd4739ad79a2b639160e572a7fa8e29304b`.

## Passing checks

- `npm test` in `commercial-foundation`: TypeScript compilation and 7/7 tests pass.
- `npm run check:production-dependencies` in `commercial-foundation`: pass; no Academy production project IDs, URLs, Stripe/Firebase runtime imports, or secret markers.
- Runtime product registry validation: pass.
- Capability inventory JSON parse: pass.
- `npm run build --prefix functions`: pass after installing declared dependencies.
- Selected Academy regression sample: 70/72 assertions pass.

The Commercial tests cover fictional organization creation, academy/location/program setup, discipline configuration, multi-organization membership context, cross-tenant denial with overlapping local identifiers, coach self-escalation denial, system-role assignment denial, invalid organization denial, active/expired/revoked entitlements, data preservation after revocation, essential-access non-paywalling, audit results, and product registration remaining distinct from release approval.

## Baseline failures not changed

The selected Academy sample has two pre-existing source/test expectation mismatches. `tests/functions/location-schedule-phase2.test.mjs` expects 10 schedule rows while the checked-in seed has 7. `tests/functions/parent-access-invitations.test.mjs` expects a one-line `tx.update` source pattern while the checked-in implementation formats the same object across multiple lines. No Academy runtime or test was changed to force either result.

Firestore emulator tests, live infrastructure tests, and deployment verification were not run. They are unnecessary for this isolated adapter and would not prove an independent Commercial environment exists. No live Firebase, Stripe, customer data, deployment, or Commercial repository write occurred.
