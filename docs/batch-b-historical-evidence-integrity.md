# Batch B — historical evidence integrity and writer audit

Date: 2026-10-11  
Starting point: Batch A commit `dafd93a416ab5022936f3d37ba88212a31d72627`

## Independent Batch A security review

### High — attestation fingerprints were not recomputed

Batch A compared the attestation's stored fingerprint fields to the revision
marker, but did not persist and re-hash the canonical inventory represented by
those fingerprints. An accidental or malicious privileged overwrite could
therefore change the attestation's evidence/scope arrays while retaining the old
hash strings. Firestore clients were denied, but Admin SDK access and future
server writers still form a security boundary.

Repair: attestations now persist the canonical evidence inventory and scope
inventory. Every certificate and consumer call reaches
`historicalBaselineAttestationMatches`, which recomputes both SHA-256 hashes and
also proves exact path, practice, and scope identity parity. Tampered content is
rejected even when all stored identity and hash fields are left unchanged.

### High — assigned cross-training locations were absent from baseline scope

The bounded baseline inventoried current location, academy-without-location,
and declared prior locations. `athleteCrossTrainingAssignments` can authorize a
different host location, so an athlete could have real historical evidence in a
location outside every scanned scope. The assignment writer correctly advanced
the source revision, but the baseline completeness proof did not include that
source universe.

Repair: baseline creation transactionally inventories the athlete's assignment
records. Until resumable manifests support those host scopes end-to-end, an
assignment for the requested discipline at an otherwise uncovered location is
an explicit `cross-training-history-scope-not-supported` blocker. More than ten
assignment records also fails closed. No incomplete history is certified.

### Medium — semantic duplicate observations were not explicitly rejected

Path uniqueness alone permits two different verified-skill documents to claim
the same practice and skill family. Live inventory parity generally exposed an
extra document, but the manifest itself did not express the semantic invariant.

Repair: baseline creation rejects duplicate `(practiceId, familyId)` identities
in addition to duplicate paths. A live duplicate document that is omitted from
the manifest is also rejected by the transactional inventory comparison.

### High — enrollment add-sport writer omitted revision invalidation

`approveAndActivate.ts` has an existing-athlete `add_sport` transaction separate
from `addDisciplineToAthlete.ts`. It wrote the new discipline map and
`disciplineIds` but did not increment `historyRevisions/{discipline}`. An older
certificate for that discipline could therefore appear current after its source
scope changed.

Repair: the attachment and `enrollment-discipline-added` revision increment now
share the same transaction. Failed or duplicate attachments cannot leave a
partial revision update.

### Confirmed protections with no defect found

- Only active Admin callers can establish or revoke a baseline.
- Firestore rules deny all client writes to source revisions, reviews,
  certificates, receipts, attestations, and revocations, including Admin claims.
- Creation reads manifest, receipt, source revision, source documents, scope
  queries, prior attestation, and revocation in one Firestore transaction.
- Idempotency requires an unchanged canonical inventory and matching live marker;
  it cannot revive a revoked record or accept changed evidence.
- Issuance, acceptance, accepted-state preview, and group preview all require
  the actual attestation, current source revision, certificate binding, and no
  revocation.
- Source changes after issuance fail either revision freshness or live source
  rechecks. Client-provided approval, AUTO, XP, and lesson fields are ignored.

## Historical writer inventory

| Writer/path | Historical effect | Revision protection / disposition |
|---|---|---|
| `practiceSessions.ts:openPracticeSession` and `createOrRecoverCanonicalPractice` | Creates an empty practice; no athlete evidence yet | No revision required. Once check-in exists, identity fields cannot materially change. |
| `practiceSessions.ts:updatePracticeCheckIn` | Writes draft/pending attendance | Not certifiable: baseline requires finalized attendance and memory. Direct client attendance writes are denied. |
| `practiceSessions.ts:finalizePracticeAttendance` | Creates finalized attendance and missing athlete-session memories | Atomically increments every present athlete's discipline revision. Finalized material corrections are rejected. |
| `practiceSessions.ts:completePracticeDailyGrind` | Updates XP-workflow metadata on finalized attendance | Does not change the fields used as historical evidence; no source revision required. |
| `practiceSessions.ts:savePracticeAthleteInput` | Changes athlete-specific practice memory | Atomically increments that athlete/discipline revision. |
| `practiceSessions.ts:savePracticeSessionMemory` and `saveDailyPracticeLog` | Coach planning/execution/reflection on the practice | Does not alter certified attendance, athlete identity memory, or verified observations. Practice identity is locked after participation. |
| `practiceSessions.ts:closePracticeSession` | Recovers a missing canonical athlete memory | Increments revision only when a missing memory is created; exact retries are idempotent. |
| `skillCheckCoachCall.ts` practice-backed Skill Check | Creates or changes `verifiedSkills/{discipline}__{family}` | Observation and revision increment share a transaction. Exact retry does not increment. No delete endpoint exists. |
| `skillCheckCoachCall.ts` non-practice Skill Check | Updates current `athletes/{id}/skills` state | Not accepted as historical source evidence and cannot enter a manifest. |
| `addDisciplineToAthlete.ts` | Adds a discipline and discipline-specific placement | Atomically increments the new discipline revision. |
| `syncActivatedEnrollmentPlacement.ts` | Changes top-level athlete location after activation | Atomically increments every known athlete discipline revision when location changes. |
| `upsertAthleteCrossTrainingAssignment.ts` | Adds, edits, expires, or changes host scope and disciplines | Atomically increments union of old and new discipline revisions. Uncovered host history now blocks baseline creation. |
| `approveAndActivate.ts` | Creates a new athlete or attaches an enrollment discipline | New athletes have no prior certificate. Existing-athlete attachment now atomically increments the attached discipline revision. |
| `createCoachAthleteCall.ts` | Creates a new coach-entered athlete | No pre-existing athlete certification to invalidate; it does not mutate an existing athlete. |
| `syncActivatedAdultContact.ts` | Adds contact/audience fields | No historical scope or evidence effect. |
| assessment, XP, decay, promotion, lesson-delivery, and competition writers | Change assessment/progression/XP or operational records | They do not write the four trusted source classes. They remain outside historical attestation authority and cannot manufacture source evidence. |
| `f8-five-rank-production-migration.mjs` | Rank-schema migration on athletes | Does not change historical locations, disciplines, attendance, memory, or verified skills. |
| decay, parent-link, Stripe, and staging scripts | Operational/non-history migrations | No trusted historical-source write found. |
| Direct Firebase clients | Potential source mutation | Rules deny attendance, source revision, review artifacts, and all unmatched practice/verified-skill writes by default. |

Repository-wide searches covered Functions source, Firestore rules, and all
checked-in scripts. Generated `functions/lib` output was excluded as a duplicate
of TypeScript source.

## Legacy history and resumable migration assessment

Supported today: an athlete/discipline with a current location, no uncovered
cross-training host, at most ten declared prior locations, at most fifty relevant
practices per queried scope, and at most fifty verified observations. Every
relevant practice must have finalized attendance, matching present athlete
memory, valid verified observations, an exhausted manifest scope, and an exact
verification receipt.

Unsupported histories remain quarantined:

- academy-only identities without a canonical current location;
- uncovered cross-training host locations;
- more than ten prior locations or assignment records;
- more than fifty practices in a scope or fifty observations overall;
- missing/contradictory attendance, memory, dates, disciplines, or observations;
- old source documents whose complete writer/revision provenance cannot be
  reconstructed.

The safe large-history design is a server-owned migration session keyed by
athlete, discipline, source revision, and review revision. It records immutable
ordered pages for each required scope, with page hash, prior-page hash, exclusive
cursor, item count, actor, and server timestamp. A final transaction must:

1. prove every declared and assignment-derived scope has a contiguous chain from
   its root through an exhausted terminal page;
2. reject duplicate practices and semantic duplicate observations across pages;
3. re-read the source revision and athlete scope identity;
4. compare an independent attendance-derived practice inventory to the union of
   page inventories; and
5. produce a Merkle-style root over scope roots before creating an attestation.

Existing resumable scan/checkpoint actions are useful diagnostic foundations,
but they intentionally cannot issue certificates. Implementing finalization
without independent inventory pagination would create a truncation bypass, so
large-history certification remains a Batch C blocker.

## AUTO readiness trace

| Stage | Required evidence / authority | Freshness and failure behavior |
|---|---|---|
| Source evidence | Finalized attendance, present athlete memory, verified skill; Coach/Admin server writers | Source transaction increments athlete/discipline revision. Missing or contradictory records fail closed. |
| Revision tracking | Server-owned monotonic revision | Client writes denied; any mismatch invalidates marker/certificate. |
| Baseline attestation | Admin plus complete bounded live inventory, manifest, and receipt | Transactional scope reads; recomputed fingerprints; unsupported scope/size blocks. |
| Coverage certificate | Admin issuer and matching live attestation | Binds source/review revision, paths, attestation ID, and fingerprints. |
| Management acceptance | Admin transaction with live source recheck | Rejects stale receipt, changed inventory, revoked/tampered attestation, or changed locations. |
| Verified skill state | Accepted chain plus current source and attestation | Diagnostic read only; any blocker returns no states. |
| Group lesson preview | Coach/Admin scope plus valid chain for every athlete | One invalid athlete prevents recommendations for the group. |
| Supervised AUTO suggestion | Verified group state plus approved curriculum policy | Still returns `eligibleForAuto:false`; Coach review and confirmation remain mandatory. |

## Outstanding blockers

- Large and cross-training histories need independently reconciled resumable
  scope support before they can be certified.
- Legacy Admin SDK or offline maintenance activity cannot be inferred from the
  database. Such histories require fresh live inventory proof; ambiguous records
  remain quarantined.
- No deployment or production migration has been performed. Staging verification
  is a later supervised activity.
