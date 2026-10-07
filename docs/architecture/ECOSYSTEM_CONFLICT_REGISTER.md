Sandman Ecosystem — Conflict Register
Status: Phase 1 Working Register
Canonical doctrine: SandmanSystem/docs/architecture/SYSTEM_OWNERSHIP_DOCTRINE.md
Purpose: Track verified places where active code, data flow, or repository structure conflicts with the ecosystem ownership doctrine.
How to Use This Register
Each conflict should identify:
- Authoritative owner — which product owns the truth.
- Conflicting repo/file — where competing or ambiguous ownership exists.
- Current behavior — what the code does today.
- Risk — what can go wrong if it remains.
- Migration target — the intended future state.
- Do not break — working behavior that must be preserved during cleanup.
- Status — current resolution state.
Status values
- OPEN — verified conflict; no migration started.
- MAPPED — affected behavior and dependencies understood.
- IN MIGRATION — authoritative implementation is being introduced.
- CONSUMER SWITCHED — consumer now uses authoritative implementation.
- LEGACY QUARANTINED — old path remains only for compatibility/reference.
- RESOLVED — duplicate ownership removed and tests confirm the new boundary.
CR-001 — Cornerman owns sport-result logic that belongs to Combat Engine
Severity: High
Status: OPEN
Authoritative owner
Sandman Combat Engine
Conflicting repo/file
CornermanAI/shared/match-state.js
Current behavior
Cornerman maintains its own match-state and result-classification logic.
The current shared match state includes:
- round state
- choice/defer logic
- overtime flow
- first-scorer tracking
- tie-breaker chooser tracking
- score mutation
- result suggestion
- hard-coded result margins
Current result logic includes:
- margin >= 15 → tech
- margin >= 8 → major
The module also owns an overtime sequence including:
- SV1
- TB1
- TB2
- UTB
Conflict
Cornerman is intended to capture competition and produce coaching intelligence.
Sport-rule definitions, win conditions, result classification, and competition logic belong to Combat Engine.
Risk
- Folkstyle-specific logic can silently affect future freestyle or Greco workflows.
- Combat Engine and Cornerman can disagree.
- Fixes made in one repo may not reach the other.
- Adding another discipline could multiply duplicated rule logic.
Migration target
Combat Engine owns:
- result classification
- technical-superiority thresholds
- overtime rules
- period/choice rules
- rule-specific match transitions
Cornerman consumes these behaviors through an explicit engine contract.
Do not break
- current live match capture
- current Cornerman UI
- existing saved-match compatibility
- coach workflow at events
- current folkstyle tournament usability
CR-002 — Cornerman owns scoring/referee rules that overlap Combat Engine
Severity: High
Status: OPEN
Authoritative owner
Sandman Combat Engine
Conflicting repo/files
- CornermanAI/shared/scoring-rules.js
- CornermanAI/shared/progression-engine.js
- CornermanAI/console/match-engine.js
- CornermanAI/console/match-engine.modular.js
Current behavior
Cornerman contains independent definitions for:
- takedown scoring
- escape
- reversal
- near fall
- referee calls
- stalls
- cautions
- locked hands
- penalties
- disqualification progression
- result types
Some Cornerman referee progression is currently more developed than Combat Engine V1.
Conflict
Cornerman contains proven competition logic that belongs in the shared rules authority.
Risk
- duplicate scoring authority
- rule updates must be made in multiple repos
- differing penalty progression
- differing result determination
- future ruleset expansion becomes increasingly fragile
Migration target
Move proven, validated rule behavior into Combat Engine one capability at a time.
Migration sequence:
1. Add behavior to Combat Engine.
2. Add tests.
3. Compare output against current Cornerman behavior.
4. Switch Cornerman consumer.
5. Remove or quarantine duplicate Cornerman rule code.
Do not break
- working referee progression
- event capture
- undo behavior
- saved match compatibility
- tournament workflow
CR-003 — Combat Games contains independent scoring authority
Severity: High
Status: OPEN
Authoritative owner
Sandman Combat Engine
Conflicting repo/files
- sandman-combat-games/game/scoring.py
- sandman-combat-games/game/settings.py
- sandman-combat-games/game/controls.py
Current behavior
The game directly awards points from gameplay controls.
Observed examples include:
- 2-point takedown
- 2-point turn
- 4-point throw
- 5-point throw
The game also uses a global:
TECH_SCORE = 10
The active game code does not declare a sport ruleset before applying that threshold.
Conflict
The game owns gameplay and simulation.
It should not own universal competition scoring doctrine.
Risk
- a 10-point tech can be interpreted as universal when it is freestyle-specific
- game scoring can drift from Combat Engine
- future folkstyle/Greco modes could inherit incorrect rules
- rule changes become product-specific patches
Migration target
Game selects an explicit ruleset.
Competition-rule outcomes come from Combat Engine or a versioned rule contract derived from it.
Game remains responsible for:
- controls
- movement
- animation
- collision
- grapple mechanics
- pacing
- presentation
- game-specific difficulty
Do not break
- playable game loop
- existing controls
- current freestyle-like prototype behavior
- animation and grapple systems
CR-004 — Combat Engine is authoritative in design but not yet a consumable shared package
Severity: High
Status: OPEN
Authoritative owner
Sandman Combat Engine
Conflicting condition
The Engine is intended to be shared, but its packaging/integration layer is incomplete.
Current behavior
Combat Engine has a public JavaScript entry point that exports:
- rule sets
- match logic
- match clock
- getRules
- applyEvent
However its package.json currently contains only module configuration and does not yet define a mature package/distribution contract.
Conflict
The ecosystem doctrine expects consumers to use Combat Engine, but consumers have not had a strong integration path.
Risk
- consumer apps solve missing needs locally
- duplicate logic becomes permanent
- no release/version compatibility discipline
- difficult cross-repo testing
Migration target
Combat Engine gains:
- package identity
- versioning
- exports contract
- release policy
- compatibility policy
- test suite
- changelog
- consumer integration documentation
For non-JavaScript consumers such as Combat Games, define a versioned cross-language rules contract rather than duplicating doctrine manually.
Do not break
- existing Engine APIs
- current rule definitions
- current consumers while migration is incomplete
CR-005 — Game architecture contains unused local “core” scaffolding
Severity: Low
Status: OPEN
Authoritative owner
Sandman Combat Engine for sport rules
Combat Games for game mechanics
Conflicting repo/files
- sandman-combat-games/core/engine.py
- sandman-combat-games/core/match.py
- sandman-combat-games/core/rules.py
- sandman-combat-games/core/scoring.py
Current behavior
These files exist as empty scaffolding while actual gameplay/scoring logic lives under game/.
Conflict
The folder structure suggests a future local game rules engine even though shared competition rules now belong to Combat Engine.
Risk
Low immediate runtime risk.
Higher architectural risk if future development fills these files with another independent sport-rules implementation.
Migration target
Before using this folder, define its purpose explicitly.
Acceptable use:
- game adapter
- game-state translation
- simulation layer
Not acceptable:
- duplicate official sport rules
Do not break
Nothing active; these files are currently scaffolding.
CR-006 — Legacy Cornerman → Sandman export can create development cards
Severity: High
Status: OPEN
Authoritative owner
Sandman System
Conflicting repo/file
CornermanAI/bridge/export-to-sandman.js
Related legacy mapping files may include:
- bridge/card-mapper.js
- bridge/curriculum-mapper.js
- bridge/skill-mapper.js
Current behavior
An older Sandman training export path builds a broad payload and includes mapped training cards.
A newer Cornerman handoff contract explicitly blocks:
- cards
- XP
- rank
- progression
- curriculum
- testing
Conflict
Two bridge philosophies coexist.
The newer contract follows doctrine: Cornerman provides evidence/recommendation and Sandman decides development consequences.
The older path can cross that ownership boundary.
Risk
- competing integration paths
- accidental curriculum/development mutation
- future developers may call the wrong exporter
- difficult debugging of Sandman-side consequences
Migration target
Trace all usages.
If unused:
- quarantine as legacy
- document replacement path
If still active:
- migrate callers to the newer evidence-based handoff contract
Do not break
Any existing production workflow still relying on the old export must be identified before removal.
CR-007 — Cornerman roster fallback can create athlete identity ambiguity
Severity: High
Status: OPEN
Authoritative owner
Sandman System for Sandman-linked athlete identity
Conflicting repo/files
- CornermanAI/shared/roster-repository.js
- CornermanAI/data/tournament-roster.js
- Cornerman → Sandman handoff payload identity fallback
Current behavior
A Sandman-linked Cornerman workspace attempts to fetch the Sandman roster.
If unavailable, Cornerman can fall back to a local tournament roster.
The newer handoff payload can accept athlete identity by stable ID or name.
Conflict
A Sandman-linked workspace can potentially operate with two identity sources:
- canonical Sandman athlete identity
- local Cornerman athlete records
Risk
- duplicate records for the same athlete
- name-based ambiguity
- evidence attached to the wrong athlete
- handoff failures or accidental mapping
Migration target
For Sandman-linked workspaces:
- canonical Sandman athlete ID is required for Sandman handoff
- local Cornerman athletes remain separate identities
- no silent name-based merge
- fallback mode is visible to the coach
Do not break
Standalone Cornerman must still support local tournament rosters when no Sandman integration exists.
CR-008 — Cornerman legacy match migration can reattach unscoped matches to the current workspace
Severity: Critical
Status: OPEN
Authoritative owner
CornermanAI match persistence
Conflicting repo/file
CornermanAI/shared/match-repository.js
Current behavior
Legacy match normalization fills a missing workspaceId using the currently active workspace.
Legacy cached matches can then be automatically posted to the backend during migration.
Conflict
Historical data without workspace provenance can acquire new workspace ownership implicitly.
Risk
- old test data can be assigned to the wrong workspace
- cross-workspace contamination
- misleading reports
- false athlete/event history
Migration target
Legacy unscoped records must not silently inherit the active workspace.
Require one of:
- explicit migration mapping
- quarantine
- manual assignment
- discard for known test-only records
Do not break
Valid already-scoped matches.
CR-009 — Cornerman browser cache/outbox can repopulate a cleared backend
Severity: Critical
Status: OPEN
Authoritative owner
CornermanAI match persistence
Conflicting repo/file
CornermanAI/shared/match-repository.js
Current behavior
Cornerman currently maintains:
- match cache
- migration-complete flag
- match outbox
On startup/use:
- legacy cached matches may be imported to the backend
- pending outbox records may automatically flush
Conflict
A backend reset does not guarantee a clean environment.
Browser-local state can reintroduce records.
Risk
- “fresh test” is not actually fresh
- deleted test data reappears
- difficult diagnosis
- accidental resurrection of stale records
Migration target
Create a deliberate reset/test workflow that coordinates:
- backend test workspace
- browser cache
- migration flag
- outbox
Reset must be environment/workspace scoped and access controlled.
Do not break
Offline resilience and legitimate unsynced match recovery.
CR-010 — Cornerman browser cache is global while match data is workspace-scoped
Severity: Medium
Status: OPEN
Authoritative owner
CornermanAI
Conflicting repo/file
CornermanAI/shared/match-repository.js
Current behavior
Browser match cache uses a single key:
cornerman_matches
Backend calls are workspace-scoped.
Loading backend matches can overwrite the single browser cache with the current workspace's returned matches.
Conflict
Persistence scoping differs between browser and backend.
Risk
- misleading offline behavior when switching workspaces
- cache replacement
- unexpected fallback results
- harder debugging
Migration target
Workspace-scoped cache storage, for example conceptually:
cornerman_matches:<workspaceId>
Exact implementation should be determined during persistence redesign.
Do not break
Offline fallback.
CR-011 — Cornerman backend stores matches as a whole-array value
Severity: Critical
Status: OPEN
Authoritative owner
CornermanAI
Conflicting repo/files
- CornermanAI/api/_lib/store.js
- CornermanAI/api/matches.js
Current behavior
Matches are persisted as one JSON array under a shared KV key.
Updating one match requires:
1. read entire array
2. modify array
3. overwrite entire stored value
Conflict
The storage model does not provide record-level persistence semantics.
Risk
- concurrent save race
- lost updates
- scaling issues
- inefficient writes
- difficult per-match lifecycle management
- difficult safe deletion/reset
Migration target
Persist matches as independently addressable records with stable IDs and workspace ownership.
Required capabilities should include:
- create
- read
- update
- archive/delete
- idempotency
- timestamps
- workspace isolation
- test reset
Do not break
Existing match IDs and current UI compatibility during migration.
CR-012 — Match format and sport rules are coupled inside Cornerman
Severity: High
Status: OPEN
Authoritative owner
- Combat Engine — sport rules
- CornermanAI — capture presentation/workflow
- Event configuration may supply competition-specific format metadata
Conflicting repo/files
- CornermanAI/shared/match-formats.js
- CornermanAI/shared/match-state.js
Current behavior
Cornerman match format definitions contain period structures such as novice, youth, JV, varsity, consolation, and college.
Shared match state then applies one result/OT logic path across those formats.
Conflict
Competition format and ruleset are not clearly separated.
A match format answers:
- how long?
- how many periods?
- which division/event format?
A ruleset answers:
- how are actions scored?
- what ends a match?
- what penalties apply?
- what criteria resolve ties?
Risk
Adding freestyle/Greco or other disciplines can reuse inappropriate folkstyle state logic.
Migration target
Every match explicitly carries both:
ruleset
and
format
Example:
ruleset: folkstyle
format: varsity_championship
Do not break
Existing tournament format selection.
CR-013 — Sandman athlete XP authority must remain isolated from external evidence systems
Severity: Critical Boundary
Status: MAPPED
Authoritative owner
Sandman System
Canonical repo/document
SandmanSystem/docs/architecture/XP_DOMAINS.md
Current doctrine
- athlete.xp is the sole authoritative Active Rank XP balance.
- athlete.lifetimeXp is the canonical Lifetime XP record.
- history/log/reporting buckets must not reconstruct Active Rank XP.
- Challenge XP does not currently have an implemented balance or conversion rule.
- external aliases and legacy totals are not authoritative.
Conflict
No confirmed active cross-repo corruption has been found.
This item exists as a protected boundary because Cornerman, games, FightRoom, and future systems may produce evidence that could eventually affect Sandman development.
Risk
Future bridge work could accidentally bypass Sandman's authoritative XP service.
Migration target
All external systems submit evidence only.
Any XP consequence must go through Sandman's authoritative XP policy/service and safeguards.
Do not break
Existing Sandman XP safeguards, caps, receipts, promotion rules, and active XP authority.
CR-014 — Shared ecosystem contracts do not yet exist as formal versioned interfaces
Severity: High
Status: OPEN
Authoritative owner
Ecosystem governance / canonical architecture doctrine
Current behavior
Several products already communicate or anticipate communication through ad-hoc bridge payloads, repository-specific mappings, environment endpoints, or local schemas.
Conflict
Cross-product integration exists without one formal contract layer.
Risk
- schema drift
- incompatible identifiers
- hidden coupling
- direct product-to-product spaghetti
- repeated mapping logic
Migration target
Define versioned contracts for:
1. Identity
2. Athlete
3. Team / Club / Organization
4. Competition
5. Intelligence
6. Entitlement
7. Media Signal
Products consume only contracts they need.
Do not break
Existing integrations remain operational until compatible contracts replace them.
CR-015 — Canonical ownership doctrine was previously distributed across repos instead of ecosystem-wide
Severity: Governance
Status: IN MIGRATION
Authoritative owner
SandmanSystem/docs/architecture/SYSTEM_OWNERSHIP_DOCTRINE.md
Current behavior
Individual products contain useful architecture rules:
- Sandman XP domain doctrine
- Combat Engine README ownership language
- Cornerman architecture and bridge doctrine
- GhostMedia vision/persistence doctrine
- FightRoom production/security notes
But there was no single cross-product constitution.
Conflict
Correct rules existed locally without ecosystem-level enforcement.
Risk
Developers or AI assistants can optimize one repository while violating another product's ownership boundary.
Migration target
Maintain one canonical ecosystem ownership doctrine.
Other repos should reference it rather than duplicate it.
Do not break
Product-specific architecture documents remain valid where they govern product-local behavior.
Protected Boundaries — No Changes Without Explicit Review
The following boundaries should be treated as protected while Phase 1 continues:
Sandman
Do not bypass:
- athlete canonical identity
- Active Rank XP authority
- Lifetime XP authority
- testing
- promotion
- curriculum ownership
- team/roster system of record
- Communications ownership
Combat Engine
Do not create new permanent official sport-rule definitions outside the Engine without documenting a temporary compatibility exception.
Cornerman
Do not remove working tournament functionality until replacement behavior is tested.
Do not clear match data until cache, outbox, migration, and backend behavior are understood together.
Combat Games
Do not remove working game scoring until an explicit ruleset adapter exists.
Other Products
Do not pull FuelAI, GhostMedia, FightRoom, or Grant Factory into Sandman as internal modules simply because they may eventually share identity or contracts.
Phase 1 Exit Criteria
Phase 1 is complete when:
- every major product has an agreed purpose and ownership boundary;
- all known duplicate ownership is recorded;
- all critical data-authority conflicts are identified;
- no new cross-product integration is built without an owner;
- authoritative contracts to build in Phase 3 are identified;
- Phase 2 cleanup can proceed without guessing what belongs where.
Immediate Next Audit Targets
1. Trace active usage of the old Cornerman Sandman exporter.
2. Trace all active Cornerman scoring/result imports.
3. Identify Sandman-side roster endpoint used by Cornerman.
4. Identify Sandman-side receiver for Cornerman handoff, if implemented.
5. Verify no Cornerman path directly writes Sandman XP/progression.
6. Inventory Combat Engine test coverage and missing referee/overtime behavior.
7. Determine whether Combat Games is intentionally freestyle-first or simply using freestyle-like prototype values.
8. Inventory browser/local persistence keys involved in Cornerman fresh-test reset.
9. Map any cross-product identity assumptions in FightRoom, FuelAI, and GhostMedia.
10. Establish the first versioned Identity/Athlete/Competition contract candidates.
Core rule: One truth. One owner. Many consumers.