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

## Trusted historical baseline attestation

`skillCheckCoachCall` now exposes the Admin-only `establish-historical-baseline`
operation. It is the only supported way to move a legacy athlete/discipline source
revision to `VERIFIED_COMPLETE`; a manually entered marker is not authority.

The operation re-reads the athlete, pending review, manifest, source-verification
receipt, source revision, every bounded current/prior location practice, finalized
attendance, athlete memory, and every verified-skill observation in one Firestore
transaction. It rejects stale reviews, changed locations, duplicate or mismatched
paths, unfinished scopes, missing attendance/memory, non-final attendance, more
than 50 practices in any scope, more than 50 evidence records, more than 10 prior
locations, and any source inventory that differs from the manifest. These limits
are intentional fail-closed migration boundaries, not silent truncation.

On success the server creates immutable
`baselineAttestations/{manifestId}` provenance containing athlete, discipline,
source and review revisions, manifest and verification-receipt IDs, exact scope,
practice and evidence identifiers, SHA-256 inventory/scope fingerprints,
authorized Admin UID, and server timestamp. It then binds those identifiers to
the source-revision marker in the same transaction. Certificate issuance,
transfer acceptance, accepted-skill preview, and group lesson preview all read
and validate the attestation and reject missing, altered, stale, or revoked
records. `revoke-historical-baseline` creates a server-owned revocation record;
it never deletes audit history.

Migration remains deliberately supervised. Legacy `VERIFIED_COMPLETE` fields
without a matching attestation remain quarantined. Administrators must open a
review, exhaust every declared scope, build and independently verify a manifest,
then establish the baseline per athlete and discipline. Inventories outside the
bounds require an explicit future migration design; they must not be split or
marked complete by hand. Baseline creation and revocation never approve evidence,
award XP, execute a lesson, or make a record eligible for AUTO.

## Implementation checkpoint (2026-10-11)
- Firestore rules now deny direct client mutations of `attendance_sessions` in source; deployment and complete client migration still need staging validation.
- Canonical attendance finalization in `practiceSessions.ts` now increments `athletes/{athleteId}/historyRevisions/{discipline}` atomically for each present athlete.
- Practice-backed verified-skill mutation in `skillCheckCoachCall.ts` increments the same counter in its verification transaction when the verified observation changes.
- This is **partial writer coverage** only. Other privileged maintenance writers, attendance review transitions, location/scope reassignment, and untracked legacy documents remain audit gates.
- Do not trust this counter for certificate issuance or AUTO until every relevant mutation path is covered, baseline migration is completed, and staging security/integration tests pass.

## Step 10 — certificate-consumption inspection (2026-10-11)

- In `skillCheckCoachCall.ts`, native-history checkpoint scans and rechecks remain **diagnostic only**: their return values explicitly set `coverageComplete:false`, `evidenceApproved:false`, and `eligibleForAuto:false`. This is the correct fail-closed behavior, not a certification success.
- The group historical-transfer acceptance path around lines 570–630 validates accepted review revision, manifest/certificate/decision chain, evidence paths and source records. **It does not visibly bind the certificate to `athletes/{id}/historyRevisions/{discipline}` or compare a current source revision to an issued certificate source revision** in that gate. A review revision is not interchangeable with a source-history revision.
- Before any group AUTO decision, inventory every consumer of `SERVER_CERTIFIED_FULL_HISTORY` and require a server-side source revision read at issue **and** consumption; absent or legacy/unbaselined source revision must fail closed.
- Do not patch in a comparison against a nonexistent certificate field: first define the server-owned issuance schema and legacy quarantine/backfill policy, then test stale certificates and concurrent mutations.
- Remaining release gates: exhaustive privileged/client mutation-writer inventory; source-revision discipline/location transfer coverage; legacy baselines or quarantine; emulator negative tests (including stale certificate use); deployed staging Firestore rules and end-to-end staging exercises. All CI green on the draft branch proves only the tests currently present.
