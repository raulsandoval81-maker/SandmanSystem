# Native history revision authority — write-path audit (2026-10-11)

## Goal
Before any native-history certificate can be issued, every mutation affecting athlete attendance, practice ownership, athlete memory, or verified skill observations must invalidate that athlete's certification revision. This document is a migration gate, not a claim that revision coverage exists.

## Verified write paths / findings
1. `functions/src/practice/practiceSessions.ts`: server transaction creates/updates `attendance_sessions/{practiceId}`, including finalization (`tx.set(attendanceRef, finalizedAttendance, {merge:true})`) and subsequent attendance updates. Changes to participation must bump the history revision for **all affected athletes**, including removed participants.
2. `firestore.rules`: `match /attendance_sessions/{sessionId}` currently permits **any signed-in account** to create and update attendance, even though server-side canonical finalization exists. A Cloud Functions-only revision hook would miss direct client writes. Do not tighten rules blindly until client consumers are inventoried and migrated.
3. `functions/src/modules/skillCheckCoachCall.ts`: reads `practiceSessions/{id}/athletes/{athleteId}/verifiedSkills` and persists diagnostic checkpoints at `athletes/{athleteId}/nativeHistoryCheckpoints/{discipline}`. Checkpoint revision is currently **review-state concurrency control**, NOT a source-history revision.
4. No explicit `practiceSessions` / `verifiedSkills` rules match was found by text search within the active rules file. Verify whether default deny applies or another collection-based write path exists before claiming write-path closure.
5. Native reviews currently query finalized attendance by location and discipline. An athlete location/discipline reassignment or participation changes may alter the required scope; source revision must account for roster/placement changes, not only a `verifiedSkills` edit.

## Required implementation gates
- Enumerate **all** server, web, and privileged maintenance writers for attendance, athlete memory, verified skill subcollections, and relevant athlete location/scope changes.
- Choose a **single authoritative mutation boundary**: server-authorized functions or an audited trigger. If client writes remain, a server-only mutation counter is incomplete.
- Make history revision monotonic per athlete + discipline. Update it atomically with each authoritative mutation **where possible**, or fail closed while asynchronous invalidation is pending. Every remove/transfer must invalidate both previous and next affected identities.
- Bind certification candidates to verified revision and complete source inventory. Check revision before issuing **and again before consuming** a certificate. Keep revision comparisons server-side.
- Backfill or quarantine legacy histories predating revision authority: absence of tracking is not evidence of immutability.
- Add emulator tests for concurrent writes, deletion, cross-actor access, location transfers, missed-invalidation attempts, and stale certificate consumption.
- Do not issue certificates or enable AUTO until all gates and end-to-end tests pass.

## Next implementation order
1. Inventory write paths in the client scripts and Cloud Functions, and identify legitimate client attendance editors.
2. Restrict canonical finalized attendance and skill mutations to guarded backend calls; update Firestore rules and client callers together.
3. Add mutation revision update to verified writing transactions.
4. Add server-only baseline/revision validation and legacy-history policy.
5. Run emulator security tests, then production staging verification before any live rollout.

## Implementation checkpoint (2026-10-11)
- Firestore rules now deny direct client mutations of `attendance_sessions` in source; deployment and complete client migration still need staging validation.
- Canonical attendance finalization in `practiceSessions.ts` now increments `athletes/{athleteId}/historyRevisions/{discipline}` atomically for each present athlete.
- Practice-backed verified-skill mutation in `skillCheckCoachCall.ts` increments the same counter in its verification transaction when the verified observation changes.
- This is **partial writer coverage** only. Other privileged maintenance writers, attendance review transitions, location/scope reassignment, and untracked legacy documents remain audit gates.
- Do not trust this counter for certificate issuance or AUTO until every relevant mutation path is covered, baseline migration is completed, and staging security/integration tests pass.
