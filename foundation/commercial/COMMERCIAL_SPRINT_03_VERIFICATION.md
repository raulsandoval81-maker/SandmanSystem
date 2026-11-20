# Commercial Sprint 3 verification

Baseline: merged PR #739 and PR #740 at `27eb8123f14336bf85fa2d966122886c609f5618`.

Implemented in the isolated `commercial-foundation` package:

- Atomic, mode-0600 JSON-file persistence with restart recovery and schema validation.
- Durable organization, academy, location, program, membership, entitlement, and audit records.
- Trusted organization switching after active membership validation.
- Explicit membership revocation and organization suspension.
- Minimal fictional organization onboarding service.
- Audited workspace and capability decisions.
- Synthetic two-tenant onboarding using conflicting local identifiers.

Verification commands:

- `npm test`: TypeScript compilation and 20/20 tests pass.
- `npm run check:production-dependencies`: pass.
- Runtime product registry validation: pass.
- `npm run build --prefix functions`: pass.
- Selected Academy regression sample: 70/72 pass. The same two baseline mismatches documented in PR #740 remain: the schedule seed contains 7 rows while its test expects 10, and a Parent invitation test asserts one-line source formatting while the equivalent update is multiline. No Academy code or test was changed.

The local adapter proves restart durability and service-layer isolation in one process. It does not prove production database rules, concurrent transactions, encryption, backups, disaster recovery, or a production identity provider. Authentication failures with unverifiable sessions fail before an identity can be trusted; they are therefore denied but not attributed to a user audit record.

No Firebase project, Stripe system, customer record, Commercial repository, deployment, or Academy runtime was accessed or modified.
