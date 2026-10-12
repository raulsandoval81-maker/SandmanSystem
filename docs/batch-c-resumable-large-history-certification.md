# Batch C — resumable large-history certification

Date: 2026-10-11
Starting point: Batch B commit `f7b611d2806a40f5d151d5a7251b140a330b2c5d`

## Purpose and trust boundary

Batch C adds a separate, versioned certification authority for histories that
cannot fit in the bounded Batch A/B transaction. It does not relax or replace
the bounded path. Only an active Admin can open, advance, reconcile, finalize,
accept, or revoke a large-history run. Firestore clients cannot write any run,
page, certificate, acceptance, or revocation record.

The bounded limits exist because the original proof reads all scopes and source
documents in one Firestore transaction. Its limits (50 practices, 50 verified
observations, 10 prior locations and bounded assignments) prevent query
truncation, transaction-size failure, and a partial result being represented as
complete. Large-history certification retains those protections through small,
durable pages plus an independent full pass; it never treats an exhausted page
as proof that the overall source universe is complete.

## Data model and state machine

`athletes/{athleteId}/largeHistoryCertificationRuns/{runId}` binds one run to:

- schema version, athlete, discipline, review revision, and source revision;
- a canonical scope inventory and scope fingerprint, including cross-training
  assignment identity;
- server-owned inventory and reconciliation cursors, sequence numbers, and
  preceding hashes;
- actor/timestamp audit fields and fail-closed status.

Each pass writes immutable, zero-padded page documents. A page binds the run
identity, source revision, scope fingerprint, deterministic sequence, cursor
boundary, previous-page hash, canonical records, counts, Admin actor, and server
timestamp. Its SHA-256 hash is computed from a recursively key-sorted canonical
representation. A reconciliation page also binds the corresponding inventory
page hash; it therefore acts as a source-verification receipt for that page.
The complete inventory chain is the evidence manifest for the large path.

The state transitions are:

1. `INVENTORY / PENDING`: discover all finalized attendance containing the
   athlete, ordered by document ID, and validate practice, athlete memory,
   discipline, scope, and verified observations.
2. `RECONCILIATION / PENDING`: repeat the same global discovery from genesis and
   require exact page-by-page source parity with the first pass.
3. `COMPLETE / CERTIFIED`: validate both complete chains and current revision and
   scope in one transaction, then create one immutable certificate.
4. management acceptance: separately create an immutable decision and bind the
   review to the certificate. Certification alone does not approve evidence.
5. `REVOKED`: preserve every audit record while preventing all consumers from
   using the authority.

Invalid source data records `BLOCKED`. Revision or scope drift aborts advancement
or finalization and requires a new run. No client count or cursor is trusted.
The caller supplies only the expected server checkpoint sequence; exact retries
return the already-created page, while stale/future checkpoints abort.

## Completeness and consistency proof

Discovery begins from the collection of finalized attendance candidates that
explicitly names the athlete. Each candidate for the requested discipline must
resolve to a matching practice and present athlete-session memory, must belong
to a derived current, prior, academy, or cross-training scope, and must contain
only valid verified observations. Invalid, contradictory, duplicated, or
unsupported records block the run.

The historical source revision and canonical scope fingerprint fence every
invocation. This is not a Firestore snapshot spanning multiple calls: instead,
all relevant writers advance the source revision, scope-affecting assignments
are fingerprinted, and the second complete pass must reproduce every page. The
final transaction revalidates both fences and both chains. Thus a hash chain
protects page integrity, while independent rediscovery and final fencing prove
completeness. A hash chain by itself never certifies the history.

Final validation rejects missing, duplicate, reordered, altered, or
non-terminal pages; invalid preceding hashes; cursor cycles; duplicate practices
or evidence; conflicting skill states; mismatched identities or roots; and any
difference between inventory and reconciliation.

## Preserved safeguards

- The bounded Batch A/B baseline remains unchanged for eligible small histories.
- Existing source revision writers and history quarantine remain authoritative.
- Certificate, acceptance, accepted-skill preview, and group preview re-read the
  current source revision, run/certificate bindings, and revocation state.
- Large history can provide verified read-only skill state only after separate
  Admin acceptance.
- Every run, certificate, decision, and preview reports `eligibleForAuto:false`.
  No XP, rank, promotion, lesson execution, or automated curriculum action is
  performed.
- Revocation and stale source evidence fail closed without deleting audit data.

## Supported scale and remaining explicit bounds

The page size is 10 practices and the chain may contain at most 1,000 pages per
pass. A run supports up to 100 prior locations, 100 cross-training assignment
records, and 100 verified observations per practice. Histories beyond these
limits are rejected for manual partition design; they are never silently
truncated. These bounds provide finite transaction/query work and a finite final
validation set while covering more than 50 practices, more than 50 observations,
and more than 10 prior locations.

## Migration procedure

For each athlete and discipline:

1. Confirm a pending management review and a tracked source revision. Do not set
   `VERIFIED_COMPLETE` manually and do not copy a certificate from another run.
2. Use the bounded path when all bounded requirements hold.
3. Otherwise open one large-history run and repeatedly advance inventory using
   the returned sequence checkpoint until the terminal page is recorded.
4. Begin reconciliation and exhaust the independent pass in the same manner.
5. Finalize only after both terminal pages. Review the reported counts and roots.
6. Make the separate Admin acceptance decision only if the source is still
   current. Revocation remains available without destroying evidence.

Multi-location and cross-training histories require canonical athlete, practice,
attendance, memory, and assignment records. Missing or contradictory legacy
records must be repaired through their authoritative writer, which advances the
source revision, and then scanned in a new run. If provenance cannot be
reconstructed, keep the history quarantined. There is no mass-certification or
fabricated-record shortcut.

## Verification and staging readiness

Focused tests cover chain tampering, gaps, reordering, duplicates, conflicting
passes, and the invariant that structural completeness never enables AUTO. The
Firestore integration covers 55 practices/observations, 11 prior locations, a
cross-training host, Admin authorization, resumable checkpoints and retry,
source-revision invalidation, premature-finalization denial, both complete
passes, acceptance, read consumers, and revocation. Security-rule tests deny
client mutation of every new authority record.

Batch D staging work must validate the deployed callable export, required
Firestore composite index behavior, production-equivalent source-writer revision
coverage, Admin claims, timeout/memory behavior near the explicit bounds, and
read-only consumer behavior. Deployment, production migration, IAM changes,
bulk certification, AUTO enablement, and acceptance of real athlete history are
not part of Batch C.
