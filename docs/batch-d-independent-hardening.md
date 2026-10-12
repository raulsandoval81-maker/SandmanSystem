# Batch D — independent security hardening

Date: 2026-10-11

This review covers the integrated Batch A, B, and C historical-evidence chain.
It is a pre-staging review only. It does not authorize deployment, data migration,
XP changes, promotions, or AUTO execution.

## Overall assessment

The architecture is internally consistent and fail-closed after the repairs in
this batch. Server-owned source revisions fence the historical source classes;
Admin-only callables build immutable evidence artifacts; Management acceptance
is separate from coverage certification; and every current consumer rechecks
revision, acceptance, certificate, run, and revocation state. Certification does
not award XP, change rank, approve a lesson, or make a plan eligible for AUTO.

The staging decision remains **CONDITIONAL**. Repository and emulator evidence
is sufficient to begin an isolated staging certification exercise, but not to
call the system production-ready. Staging must prove that deployed data follows
the canonical attendance and athlete-memory shapes and that every production
writer increments the source revision in its deployed configuration.

## Trust-chain trace

1. Enrollment and athlete creation establish athlete identity and disciplines.
   Existing-athlete discipline or location changes increment affected history
   revisions; creation does not certify pre-existing history.
2. Practice finalization writes the practice, finalized attendance membership,
   athlete-session memory, and a monotonic discipline revision in one server
   transaction.
3. Coach skill verification writes under the athlete-session memory and bumps
   the same source revision when evidence changes.
4. Cross-training assignment mutations bind home/host locations and affected
   disciplines, and atomically increment the union of old and new revisions.
5. Batch A/B bounded certification derives scope from server records, verifies
   live source documents, binds manifest and receipt identity, attests a trusted
   baseline, issues a coverage certificate, and requires a separate acceptance.
6. Batch C large-history certification derives scope and revision server-side,
   advances server-owned cursors through immutable hash-chain pages, performs a
   second pass, validates both chains, and issues an immutable certificate.
7. Batch D adds an independent athlete-memory membership inventory at
   finalization. Agreement between two passes over the same attendance index is
   no longer enough to prove membership completeness.
8. Consumers accept only a current, unrevoked, review-bound accepted certificate.
   Skill-state and group-lesson endpoints are read-only previews and continue to
   return `eligibleForAuto:false`.

## Security findings

### High — shared discovery blind spot

**Root cause:** Both large-history passes began from the same
`attendance_sessions.presentIds` query. A canonical athlete-session memory that
was absent from that index could be omitted by both passes, producing matching
hash chains over the same incomplete set.

**Repair:** Finalization now independently queries canonical athlete-session
memories by server-owned athlete identity, validates their paths and discipline,
and compares their practice IDs with the attendance-derived chain. Missing,
extra, duplicate, malformed, or over-limit membership fails closed. The
certificate binds the independent membership fingerprint.

**Regression:** The emulator inserts a canonical memory after both passes without
adding it to `presentIds`; finalization now rejects it with
`attendance-index-incomplete`.

### Medium — stale review replay at acceptance

**Root cause:** A large-history certificate bound `reviewRevision`, but acceptance
did not compare it with the current review. A certificate from an earlier review
cycle could therefore be accepted if the review returned to pending state while
the source revision and scope stayed unchanged.

**Repair:** Acceptance requires equality among current review, run, certificate,
and acceptance revisions. Both preview consumers repeat the review-revision
binding before exposing any resolved state.

**Regression:** Changing the review revision after certification now causes
acceptance to fail with `failed-precondition`.

### Low — finalize and accept retry inconsistency

**Root cause:** Immutable artifacts existed, but a retry after a successful
finalize or accept was rejected by phase/status checks or `create()`.

**Repair:** Exact retries validate existing immutable identity and return the
same successful result. A conflicting artifact still fails closed.

**Regression:** The integration test repeats finalize and accept and verifies
the immutable result is reused.

### Low — Batch C source omitted from CI path filters

**Root cause:** The historical workflow watched the older reconciliation files
and tests, but not the two resumable certification source files.

**Repair:** Both Batch C source paths now trigger the historical unit, rules, and
emulator jobs on pushes and pull requests.

## Evidence completeness and residual limits

For canonical data, attendance membership and athlete-session memory now provide
independent discovery paths. Page-chain comparison proves that inventory and
reconciliation observed identical validated source records; the independent
memory comparison proves that both did not merely omit the same indexed member.
Scope identity includes current location, academy-only identity, declared prior
locations, and discipline-matching cross-training home/host assignments.

Certification remains quarantined when records are malformed, source revision
or scope changes, pages are missing/reordered/duplicated, an evidence path or
semantic observation is duplicated, latest states conflict, or the independent
membership inventories differ.

Residual limitations to verify in staging:

- Legacy memories without canonical `athleteId` and `discipline` fields are not
  certification candidates. They require an explicit migration inventory and
  remain quarantined; they must not be silently normalized during certification.
- Orphaned `verifiedSkills` subcollections without a canonical athlete-session
  memory are invalid evidence. A staging collection-group audit should enumerate
  them before any athlete is certified.
- The large path intentionally caps 10,000 memories and 1,000 pages. Histories
  beyond that limit remain blocked pending a separately reviewed partitioning
  design.
- Completeness depends on all deployed privileged writers incrementing the
  discipline revision. Repository review and emulator tests cover the known
  writers, but deployed revision behavior must be exercised in staging.

## Concurrency and recovery

Transactions read run state, source revision, scope, source pages, and immutable
artifacts before writing. Sequence compare-and-set prevents concurrent requests
from skipping a page. The immediately repeated page request returns the existing
page; stale or future sequence requests abort. Cursors are stored on the run and
are never accepted from the caller. Source or scope mutation blocks the next
advance, reconciliation start, finalization, acceptance, and consumption.

Interrupted runs resume from the stored cursor and previous hash. No certificate
is written until both terminal pages are present and both complete chains pass.
Finalization, acceptance, and revocation are retry-safe. Revocation is checked at
acceptance and every certificate consumer.

## Authorization and Firestore rules

The callable requires Firebase Authentication plus active Admin staff authority.
Coach and Management identities cannot open, advance, finalize, accept, or
revoke a certification. Group previews separately enforce Coach/Admin role and
per-athlete location access.

Firestore rules deny all client creates, updates, and deletes for source
revisions, historical reviews and descendants, large-history runs/pages,
certificates, and revocations. The rules emulator exercises unauthenticated,
Coach, Management, Admin, and custom-claim clients against those paths.

## AUTO and progression boundaries

- Certificates always start with `evidenceApproved:false` and
  `eligibleForAuto:false`.
- Acceptance records `xpAwarded:false` and remains separate from certification.
- Preview consumers revalidate current source revision and revocation state.
- Group suggestions require every athlete to have accepted current evidence.
- Suggested plans are Coach-authored drafts; confirmation is a separate Coach
  action. Neither action executes a lesson or awards XP.
- Historical certification code contains no XP, rank, promotion, or lesson
  execution write.
- Revoked or stale evidence resolves to blockers and an empty skill state.

## Deployment configuration audit

`.firebaserc` defines production (`sandmandashboard`) and staging
(`sandman-combat-staging`) project aliases, but Hosting target configuration is
present only for production. `firebase.json` also includes functions, hosting,
Firestore rules, and Storage rules in one repository-level configuration. A
broad deploy from the wrong alias is therefore unsafe. No configuration or IAM
was changed in Batch D.

## Staging certification plan

1. Record the production project ID, staging project ID, active CLI alias, and
   service-account principal. Abort if any resolved target equals production.
2. Verify the staging service account has only the minimum staging roles. Do not
   copy production credentials, secrets, IAM bindings, or live athlete data.
3. Create synthetic staging identities for Admin, Management, in-scope Coach,
   out-of-scope Coach, and unauthenticated client tests.
4. Load synthetic athletes covering current location, prior location,
   academy-only legacy identity, cross-training host/home, conflicting evidence,
   missing attendance, missing memory, and more than 50 practices.
5. Run authenticated client rule denials before callable tests. Confirm all
   authority collections reject create, update, and delete for every client role.
6. Run bounded Batch A/B certification on a small complete fixture. Exercise
   stale manifest, wrong receipt, revoked baseline, revision mutation, and
   Management acceptance failure paths.
7. Run Batch C/D certification on the large fixture. Interrupt after multiple
   pages, resume, retry the last page concurrently, and verify sequence/hash
   continuity and exact idempotent finalization.
8. Insert a memory not represented in `presentIds`, a reordered page, duplicate
   observation, stale review revision, and source mutation between passes. Each
   must remain blocked with no certificate or acceptance side effect.
9. Accept only the clean fixture, then revoke it. Verify accepted-state and group
   previews immediately quarantine it and return no skill states.
10. Inspect athlete XP, rank, promotion, lesson execution, and audit records
    before and after every certification action. They must be byte-for-byte
    unchanged except for expected certification audit collections.
11. Verify group recommendations remain previews, require Coach approval, and
    return `eligibleForAuto:false`, `lessonExecuted:false`, and `xpAwarded:false`.
12. Run a collection-group inventory for legacy/malformed memories and orphaned
    verified observations. Do not certify affected athletes; record migration
    blockers without modifying those records.
13. Export or snapshot staging certification-only collections before the test.
    Roll back by deleting only synthetic staging fixtures and Batch D authority
    artifacts, then confirm the pre-test snapshot. Never import the snapshot into
    production.
14. Recheck CLI target, resolved project number, functions URL host, Firestore
    database, and Auth tenant after the exercise. Any production identifier,
    unexplained mutation, skipped negative test, or revision mismatch is an
    immediate rollback and release blocker.

## Verification result

- TypeScript build: passed.
- Historical unit suite: 57 passed, 0 failed, 0 skipped.
- Firestore integration suite: 76 passed, 0 failed, 0 skipped.
- Historical authority rules suite: 1 passed, 0 failed, 0 skipped; the single
  parameterized test exercises all protected paths and client roles.
- New adversarial assertions: incomplete independent membership, stale review
  replay, idempotent finalize, and idempotent accept.

## Readiness decision

**CONDITIONAL for isolated staging certification.** The confirmed repository
defects are repaired and all required local/emulator checks pass. Production
readiness remains blocked on the staging sequence above, canonical legacy-data
inventory, deployed writer-revision verification, and explicit production
isolation evidence.
