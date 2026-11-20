# Commercial Sprint 06 Verification

## Baseline

- Branch created from merged Sprint 5 commit `bc820875e1065a68b9d416c71b256d3a302ed908`.
- Required pull requests #739, #740, #741, #743, and #745 are represented in the baseline history.
- Pre-change Commercial suite: 57 passed, 0 failed.

## Implementation

- Added tenant-scoped curriculum definitions, versions, skills, athlete assignments, Coach evaluations, progression cycles, XP events, promotion history, and season phases.
- Locked Road2Champion to 800/1600/2400/2800/3200 and Path2Legend to 1000/1600/2400/2800/3000, each totaling 10,800 XP.
- Strength accepts verified fixed 5 or 10 XP submissions; Honor accepts verified fixed 5 XP submissions. Callers cannot override rank thresholds.
- XP event identifiers are organization-scoped and replay protected. Award plus cycle update and promotion plus reset are atomic in the local reference adapter.
- Promotion requires threshold XP and an explicit verified-gates assertion, records immutable history, resets active-cycle XP, and preserves lifetime history.
- Four earned stripes form a monotonic protected floor. Decay that crosses that floor is rejected.
- Recovery values remain disabled because 30/30/30/150 is not established as authoritative policy.
- Coach submissions require actual tenant, academy/location scope, and explicit athlete assignment. Management adjustments require reason and attribution.
- Athlete progression is read-only. Parent progression requires the new explicit `progression` relationship permission.
- Persistence validates all curriculum, assignment, cycle, event, evaluation, and promotion references on restart.

## Doctrine discrepancies

Current Academy Path2Legend sources disagree: `programThresholds.ts`, `progressionCyclePolicy.ts`, and public presentation configuration encode different middle/final caps. The explicit Sprint 6 locked table is used by the Commercial adapter without modifying Academy behavior. Brazilian Jiu-Jitsu remains blocked because no approved curriculum was established during source verification.

## Verification

- Commercial TypeScript build: passed.
- Complete Commercial suite: 71 passed, 0 failed.
- Sprint 6 progression suite: 14 passed, 0 failed.
- Product registry validation: passed.
- Production dependency scan: passed across 14 Commercial source/test files.
- Academy Functions TypeScript build: passed.
- Focused Academy progression regressions: 98 passed, 0 failed.

## Release state

No Academy production changes, Firebase/Stripe operations, Commercial repository import, deployment, release approval, merge, or migration were performed.

## Independent review remediation — PR #746

The following security fixes were implemented on the existing draft PR:

- The promotion service independently checks persisted, approved evaluations for every required skill in the current active curriculum assignment, in addition to the Management acknowledgement of non-XP gates. A caller's boolean alone cannot promote an athlete.
- Coach evaluations fail for inactive, completed, or revoked assignments and for assignments without exactly one matching active progression cycle.
- Each XP event now records `rankIndexAtAward`. On restart the local adapter deterministically replays each cycle's events by rank, compares active XP and historical XP with the stored balances, checks protected stripe floors, verifies promotion sequence/rank transitions and historical totals, and rejects event/athlete/cycle mismatches.
- An unsupported or unapproved source label is rejected for Coach XP. This is an **allowlist of declared sources only**, not proof that an actual training event occurred.
- The decay API is disabled (`DECAY_POLICY_UNVERIFIED`) until an independently verified policy and trusted triggering event are available. Stripe protection remains enforced for manual negative adjustments.
- Added tests for missing approved-skill evidence, revoked assignments, unapproved Coach source labels, and tampered XP balances and promotion history.
- GitHub Actions run #44830307700 completed successfully with 75 Commercial tests passing and zero failing, including the production-dependency check.

**Still a release blocker:** Skill approval and Management confirmation in this local reference environment do not independently establish every Academy-specific rank/physical/seasonal advancement gate. Rank-specific advancement policy, genuine event provenance/attestation, Path2Legend source reconciliation, production identity and persistence controls require separate owner approval. No runtime production integration or Commercial transfer is authorized.
