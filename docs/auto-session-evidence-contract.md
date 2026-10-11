# AUTO Session Builder — evidence integration contract

Status: blocked pending authoritative per-practice verified progression. Updated 2026-10-11.

## Existing implementation
- Session Builder: `public/coaches/execution/session-builder/session-builder.js`.
- Attendance groups: `trainingGroups` restored from saved session context for the same `practiceId`. This is not yet a guaranteed authoritative server fetch.
- Current prescription fallback: first nonempty curriculum wave. `progressionVerified = false` by construction.
- Existing launch guard refuses AUTO when any group is missing, unresolved, or unverified.
- Existing server preview: `skillCheckCoachCall`, action `preview-group-lessons` in `functions/src/modules/skillCheckCoachCall.ts`. It verifies individual access, accepted historical-evidence manifests, proof chains, source skill observations, skill-state conflicts, and curriculum prerequisites.
- That preview intentionally returns `diagnosticOnly: true`, `coverageComplete: false`, `evidenceApproved: false`, `eligibleForAuto: false`. Its output MUST NOT be used to set `progressionVerified: true`.
- `historicalSkillReconciliation.ts` is read-only and cannot authorize AUTO.

## Integration sequence
1. Identify the canonical `practiceId` and server-authorized attendance snapshot. Return stable grouped athlete IDs and group identities, not client-supplied IDs used as authority.
2. For each group, resolve EVERY current athlete's accepted skill state and all required historical evidence. Preserve per-athlete blockers, complete coverage claims, and audit references; missing evidence is unknown, not untrained.
3. Resolve approved curriculum dependencies and prior instruction history within authorized scope; determine lesson recommendations based on actual group skill gaps, not a fixed first wave.
4. Add a NEW server-authorized, practice-bound AUTO decision endpoint that repeats authorization and freshness checks. Return signed/identified decision evidence and `eligibleForAuto` only after all prerequisites and approvals are proven.
5. Require the AUTO execution endpoint to recheck the persisted decision and relevant changes. A client-side `progressionVerified` flag alone must never authorize launch.
6. Unit/integration test no attendance, partially checked-in groups, mixed tier, stale evidence, incomplete transfer coverage, conflicting states, unapproved prerequisites, reused practice ID, location crossing, and concurrent state changes.

## Interim behavior
- MANUAL and HYBRID remain available under their existing rules.
- AUTO remains blocked.
- Do not turn an advisory diagnostic preview or fallback curriculum wave into execution permission.
- Do not silently create or approve evidence.
