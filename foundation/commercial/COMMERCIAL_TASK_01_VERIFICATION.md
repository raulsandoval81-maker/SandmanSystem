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

## Security review remediation (2026-11-20; unmerged)

Review found bypasses not covered by original 7 tests: a caller-defined system admin flag, no membership requirement for program reads or entitlements, tenant-colliding store keys, and missing academy/location scope controls.

Follow-up commits on PR #740 now:
- Require a server-supplied `IdentityAuthority` to verify opaque session IDs; reject arbitrary claimed role/organization fields.
- Use an **explicitly test-only** identity issuer and persistence store; neither is permitted in a real API.
- Require valid active memberships for reads and capability evaluations; enforce academy/location scopes on program reads.
- Qualify store record keys by organization ID; reject silent record replacement.
- Validate role/scope/state/date inputs and parent-child ownership; reject missing or inactive organizations.
- Add adversarial fixtures for forged sessions, nonmembers, duplicate local IDs, scope denial, privilege escalation, suspended memberships, cross-tenant grants, and revocation.
- Add a pull-request-only GitHub Actions test workflow.

**Verification status for the new remediation:** Code and tests have been committed, but a successful CI run is **not yet confirmed**. Do not represent the previous 7/7 result as validation of this changed code. No Firebase emulator, independent persistence or live browser tests were run. Existing Academy 70/72 result is unchanged and separate. Hold merge pending CI and independent code review.

No Academy production files were modified and no deployment or Commercial repository transfer occurred.
