# Phase 6 activation record

## Baseline and source result

Phase 6 starts from `f3f8bda8747f3dce4f91d7469681fa1d01cdfb93`. The synthetic Firestore manifest is now validated and written in one transaction. The earlier complete-path preflight remains in place before Auth mutations. Transaction retries re-read every exact path, so a nonsynthetic record committed while seeding is pending is rejected and no other manifest write commits.

The emulator concurrency proof coordinates a conflicting nested verified-skill write with the seed transaction. The nonsynthetic record remains unchanged and the unrelated manifest document remains absent. A second test proves repeatable writes over explicitly synthetic records.

Firebase Auth and Firestore do not share a transaction. The seeder does not claim cross-service atomicity. It records every failed Auth rollback in an `AggregateError` alongside the original failure.

## Cloud ownership check

No Phase 6 authorization package was supplied. There is no explicit staging project ID, staging credential, service-account identity, billing approval, deployment confirmation, or separate seed confirmation. The repository still contains only production alias `sandmandashboard`. No unspecified Firebase login was used for discovery.

Consequently:

- Deployment: BLOCKED and not attempted.
- Remote synthetic seeding: BLOCKED and not attempted.
- Hosting URL: unavailable.
- Callable Functions identity: not remotely verified.
- Desktop authenticated acceptance: not executed.
- Mobile 390×844 acceptance: not executed.

The exact owner actions remain in `wrestling-auto-phase5-execution.md`. Deployment and seeding require distinct explicit approvals after the project, billing, credentials, and least-privilege roles are verified.

## Acceptance matrix

| Area | Automated evidence | Live staging evidence | Status |
| --- | --- | --- | --- |
| Transactional collision protection | Firestore emulator concurrency test | Not required | PASS |
| Repeatable synthetic manifest | Firestore emulator idempotency test | Second remote seed not authorized | LOCAL PASS / REMOTE BLOCKED |
| Wrestling curriculum and safeguards | Focused unit and callable integration suites | Authenticated browser unavailable | LOCAL PASS / LIVE BLOCKED |
| Desktop workflow | Checklist prepared | No staging URL/account | BLOCKED |
| Mobile 390×844 workflow | Checklist prepared | No staging URL/account | BLOCKED |
| Production isolation | No production credential, read, write, or deployment used | Not applicable | PASS |

Source readiness is GO for review. Operational staging acceptance and production remain NO-GO.
