# Sandman Commercial Issues 1–6 acceptance — 2026-11-20

Baseline: `dc776ac3f75c12d8728edd7d688d6dc1c5337ddc` (`main` after unrelated enrollment PR #765; Commercial reconciliation remains through PR #764).

| Issue | Verified completed | Remaining acceptance gate | Status |
|---|---|---|---|
| #1 Curriculum and progression | Canonical 10,800-XP pathways, promotion reset/history, mandatory per-rank concepts, persistence integrity, age-14 policy preview, Champion-to-Warrior policy, Coach exception policy | Durable age-verification source and authorized transition mutation are not yet approved or integrated | PARTIAL / EXTERNAL POLICY GATE |
| #2 Inactivity and recovery | Decay remains disabled; stripe/promotion floors are protected; durable recovery case and full-practice Coach evidence now require completed session plus present attendance; replay is denied; no recovery XP can be awarded | Authoritative decay and recovery award schedule remains unapproved | BLOCKED — POLICY |
| #3 Curriculum integrity | Approved disciplines only; canonical ranks cannot be changed; required Sandman concepts cannot be removed; Coach extensions are additive; assignment and restart validation tested | Production content-governance operations and upload review remain outside this foundation | COMPLETE FOR FOUNDATION |
| #4 Authentication and authorization | RS256 production-token adapter verifies signature, issuer, audience, expiry, not-before and revocation; one-time email-proof invitations are hashed, scoped, expiring, durable and audited; acceptance creates only the invited membership | Configure a real identity provider, verified-email proof provider, signing-key rotation, mail delivery and production session-revocation store | BLOCKED — INFRASTRUCTURE |
| #5 Independent persistence | Independent PostgreSQL migration defines Commercial-owned tenant tables, composite foreign keys, forced RLS, append-only XP/promotions, replay constraints, migration checksums and tenant transaction boundary | No PostgreSQL server, container runtime or driver exists in this environment; migration and concurrency/isolation must run against provisioned PostgreSQL | BLOCKED — INFRASTRUCTURE |
| #6 Athlete portability | Adult/guardian source consent uses verified privacy-scoped previews; signed packages bind destination and expiry; receiving Management accepts separately; curriculum compatibility, pristine destination, no demotion, replay denial, minimal history, audit and restart validation are tested | Production signing-key custody, globally portable athlete identity, prior-organization notification and live cross-organization integration review | BLOCKED — INFRASTRUCTURE/PRIVACY |

## Verification executed

- Commercial TypeScript build and complete suite: **109 passed, 0 failed**.
- New completion acceptance tests: **10 passed, 0 failed**.
- Production-dependency scan: **21 files passed**.
- Product-registry validation: passed.
- Academy Functions TypeScript build: passed.
- Focused unchanged Academy regression selection: **115 passed, 1 failed**. The failure is the previously documented Parent invitation source-format assertion (`consumption binds server-side without creating an Athlete Auth account`); the implementation uses a multiline equivalent update. No Academy source or test was modified.
- PostgreSQL structural/migration-boundary tests: passed. A real PostgreSQL integration test was **not executed** because no server, container runtime, driver or credentials are available.

## Safety and release decision

No Academy production code, Firebase/Stripe state, real athlete data, live transfer, production database or deployment was modified. Issues 1–6 do **not** collectively meet production acceptance yet. The Commercial foundation should not proceed to Issue #7 as production-ready until the policy, identity, PostgreSQL and privacy gates above are closed.
