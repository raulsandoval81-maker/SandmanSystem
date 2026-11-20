# Commercial Sprint 4 verification

Starting baseline: Sprint 3 merge `213209c2d53b9b7319ff70ac41e1197f18ad1aab`; implementation branch started from later `main` commit `e28c4ad91ed9e490d01516dff189759060509f64`.

Implemented without modifying Academy behavior:

- Tenant-scoped Management overview, staff assignment/revocation, entitlement visibility and audit history.
- Scheduling create/list/read/update/cancel with time, coach, academy, location and program validation.
- Synthetic-athlete attendance creation, duplicate rejection and audited correction.
- Coach workspace, assigned sessions/programs, practice notes and attendance flow.
- Durable session, synthetic-athlete, attendance and practice-note persistence with restart relationship validation.
- Organization capability enforcement for scheduling, attendance and Coach workspace.

Verification:

- `npm test` in `commercial-foundation`: TypeScript build and 34/34 tests pass.
- `npm run check:production-dependencies`: pass.
- Product registry and operating integration manifest JSON validation: pass.
- Academy Functions TypeScript build: pass.
- Focused Academy regression sample: 71/73 pass. The two previously documented baseline mismatches remain unchanged: the schedule test expects 10 seed rows while 7 are present, and the Parent invitation source-pattern test expects a one-line update while the implementation is multiline. The later historical-pricing regression passes.

The tests onboard two fictional organizations with identical academy, location, program, session, athlete and note IDs. Both complete Management → Scheduling → Coach → Attendance → Management review and survive persistence restart. Negative tests cover cross-tenant access, privilege escalation, revoked coaches, invalid session relationships/times/coaches, duplicate attendance, unrelated athletes, identity mismatch and revoked entitlement behavior.

The local JSON adapter remains a single-process reference implementation. No production identity provider, database rules, API transport, encryption, backup, recovery, deployment or Commercial transfer is proven or authorized.

## Post-review security corrections (PR #743 remains draft)

- Scheduling updates now require authorization for both the existing session scope and the requested destination scope; staff scoped to another location cannot move an existing session into their own location.
- Sessions with recorded attendance cannot change academy, location or program ownership.
- Operational callback execution is now module-private in `operations.ts`; the previous public `runAuthorized(..., callback)` interface has been removed. A limited `authorizeOperational` check remains for trusted internal adapters. The local store remains explicitly test-only and publicly mutable in-process; it must never be exposed as an HTTP API or production authorization boundary.
- Scheduling lists filter per-session scope; coach workspaces honor coach academy/location membership and filter assigned sessions and programs.
- Attendance and session reads now apply management roles to the actual session scope, rather than granting organization-wide access from an unrelated location assignment.
- Persistent restart validation rejects attendance associated with the wrong program, malformed attendance states and timestamps, blank/malformed notes, and invalid sessions.
- Added adversarial tests for unauthorized session moves, scoped coach workspace, removed callback entrypoint, malformed restored records, and changes that would orphan attendance.

CI for the new commits must be verified separately. The earlier 34/34 check does not validate these review changes. No production deployment, Academy runtime modification, or Commercial import was authorized.
