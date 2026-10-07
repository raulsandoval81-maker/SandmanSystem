# Sandman Ecosystem — System Ownership Doctrine

**Status:** Phase 1 Draft  
**Purpose:** Establish authoritative ownership boundaries across the Sandman ecosystem and prevent cross-product logic drift.

## 1. Governing Principle

Every important piece of system truth must have **one authoritative owner**.

Other products may:

- read that truth,
- receive a versioned contract containing that truth,
- produce evidence or recommendations about that truth,

but they must not create competing authoritative implementations.

A product may maintain temporary UI state, caches, simulations, or derived values, but those must never silently become a second source of truth.

---

# 2. Sandman System

## Purpose

Sandman System is the academy, team, athlete-development, and operational system of record.

## Sandman OWNS

- athlete identity
- athlete profiles
- parent/family relationships
- team and academy roster
- coach/management operational roles
- academy admissions
- communications
- attendance
- practice history
- curriculum
- athlete development
- assessments
- testing
- promotion
- Journey rank
- Active Rank XP
- Lifetime XP
- Sandman Strength/Honor development domains
- academy recognition
- academy/team historical records

Sandman already explicitly declares `athlete.xp` as the sole authoritative Active Rank XP balance and `athlete.lifetimeXp` as the canonical permanent lifetime record. Logs and reporting buckets are forbidden from reconstructing Active Rank XP. 

## Sandman MAY CONSUME

- verified competition evidence
- competition statistics
- Cornerman recommendations
- Combat Engine match outcomes
- FightRoom participation evidence
- FuelAI-approved training/wellness information
- other external evidence through approved contracts

## Sandman DOES NOT OWN

- official sport scoring rules
- sport-rule definitions
- Cornerman tactical intelligence
- media production logic
- FightRoom network matchmaking
- FuelAI wellness/nutrition intelligence
- grant-generation logic

External evidence may influence Sandman decisions.

External products do not directly control Sandman progression.

---

# 3. Sandman Combat Engine

## Purpose

Combat Engine is the authoritative competition-rules layer.

## Combat Engine OWNS

- rulesets
- scoring definitions
- legal scoring events
- match state rules
- win conditions
- technical-superiority thresholds
- rule restrictions
- competition event processing
- rule-derived match statistics
- eventually referee/penalty rules
- eventually overtime/criteria rules

The current Engine already exports rule access and event-processing functions alongside folkstyle, freestyle, Greco-Roman, and beach wrestling rules. 

Current verified technical-superiority doctrine includes:

Folkstyle — 15  
Freestyle — 10  
Greco-Roman — 8

Freestyle currently defines its own scoring vocabulary and 10-point tech lead. 

Greco-Roman currently defines an 8-point tech lead and style restrictions including no leg attacks, trips, or active leg use. 

## Combat Engine MAY CONSUME

- match configuration
- selected ruleset
- participants
- sanctioned competition format

## Combat Engine DOES NOT OWN

- athlete profiles
- Sandman XP
- Sandman rank
- promotion
- curriculum
- coaching recommendations
- academy membership
- media
- billing

Combat Engine determines competition truth.

It does not determine athlete-development rewards.

---

# 4. CornermanAI

## Purpose

Cornerman is the competition capture and coaching-intelligence system.

Its existing architecture describes the core loop as:

Match → Event Capture → Match Log → Report → Pattern → Recommendation → Training Focus. 

## Cornerman OWNS

- live competition capture experience
- competition observations
- match evidence
- match timeline
- opponent context
- reports
- patterns
- tactical analysis
- recommendations
- coaching intelligence
- competition-specific review

## Cornerman MAY CONSUME

- athlete identity from Sandman
- team identity from Sandman
- authoritative scoring/rules from Combat Engine
- event and competition context

## Cornerman DOES NOT OWN

- Sandman XP
- rank
- promotions
- curriculum authority
- athlete testing
- academy attendance
- athlete canonical identity
- official sport-rule definitions

The newer Cornerman → Sandman handoff already blocks direct assignment of cards, XP, rank, progression, curriculum, and testing. 

That becomes official ecosystem doctrine.

Cornerman may recommend.

Sandman decides development consequences.

---

# 5. Sandman Combat Games

## Purpose

Combat Games owns simulation, interaction, and game experience.

## Combat Games OWNS

- player controls
- movement
- animation
- collision
- game physics
- grapple simulation
- visual presentation
- game difficulty
- AI opponents
- game-specific balance
- game progression that is explicitly separate from Sandman athlete progression

## Combat Games MAY CONSUME

- Combat Engine rules
- scoring definitions
- match result definitions
- ruleset metadata
- selected Sandman identity/profile data when explicitly integrated

## Combat Games DOES NOT OWN

- official wrestling rules
- universal scoring doctrine
- Sandman XP
- academy rank
- canonical athlete development

Current game code directly awards points and uses a global `TECH_SCORE`, demonstrating why the game must eventually become a rules consumer rather than a second rules authority. 

---

# 6. FuelAI

## Purpose

FuelAI is an independent training, wellness, nutrition, recovery, and performance-support product.

It already operates with its own API/server structure, Firebase infrastructure, security rules, testing, and backend dependencies. 

## FuelAI OWNS

- FuelAI member profile extensions
- food/nutrition tools
- hydration tools
- training-support tools
- recovery tools
- FuelAI recommendations
- FuelAI subscription entitlements
- FuelAI team features
- FuelAI-specific history and intelligence

## FuelAI MAY CONSUME

- approved identity information
- approved athlete/team context
- training context
- membership eligibility through an explicit contract

## FuelAI DOES NOT OWN

- Sandman athlete progression
- academy rank
- competition scoring
- Cornerman tactical intelligence
- Sandman attendance authority

FuelAI remains a product, not a folder inside Sandman.

---

# 7. FightRoom

## Purpose

FightRoom is a coach-to-coach controlled sparring and training network for amateur combat sports. 

## FightRoom OWNS

- participating club network records
- room availability
- visiting/hosting requests
- room matching
- capacity
- approval flow
- confirmations
- FightRoom sessions
- network-specific safety/workflow state

## FightRoom MAY CONSUME

- coach identity
- club/team identity
- approved athlete roster information
- ruleset/division information

## FightRoom DOES NOT OWN

- Sandman progression
- Sandman rank
- Cornerman match intelligence
- official competition scoring rules
- academy operational history

FightRoom should be able to exist independently of Sandman.

Sandman may be one participating organization.

---

# 8. GhostMediaAI

## Purpose

GhostMedia is the media operating system.

Its current doctrine defines the loop:

Scout → Discover → Ideas → Content → Factory → Carousel → Queue → Posted → Winners → Patterns → Opportunities → Scout. 

## GhostMedia OWNS

- media observations
- content opportunities
- content ideas
- hooks
- captions
- scripts
- creative assets
- production queue
- publishing workflow
- content-performance intelligence
- reusable media patterns

## GhostMedia MAY CONSUME

- approved public Sandman events
- approved Cornerman competition signals
- FightRoom signals
- FuelAI content opportunities
- other ecosystem media events

## GhostMedia DOES NOT OWN

- athlete rank
- athlete XP
- competition scoring
- academy operations
- training recommendations
- roster identity authority

GhostMedia receives media signals.

It does not become the operational authority of the system that generated them.

---

# 9. Grant Factory AI

## Purpose

Grant Factory is the funding, opportunity, application, proposal, and grant-intelligence product.

Its current architecture already separates advisor, application, authentication, connectors, export, orchestration, knowledge, narrative, opportunity, proposal, reporting, and storage engines. 

## Grant Factory OWNS

- funding opportunities
- grant knowledge
- proposal generation
- organizational narratives
- application workflow
- eligibility analysis
- grant reporting
- grant-specific integrations

## Grant Factory MAY CONSUME

- approved organization facts
- approved program descriptions
- approved impact metrics
- approved financial/program evidence

## Grant Factory DOES NOT OWN

- operational athlete records
- Sandman XP
- competition data authority
- academy membership
- combat rules
- media production authority

---

# 10. Doctrine Reader

## Purpose

Doctrine Reader is an internal knowledge/governance tool.

It is not currently treated as an authoritative business-domain owner.

## Doctrine Reader MAY

- display doctrine
- search doctrine
- explain approved system boundaries
- expose versioned architecture knowledge

## Doctrine Reader MUST NOT

- silently become the source of business truth
- mutate athlete state
- redefine product ownership
- create rules that have not been approved in their authoritative repository

The authoritative doctrine remains version-controlled source material.

---

# 11. Bridge Doctrine

A bridge is transportation and translation.

A bridge does not become an owner.

A bridge may:

- validate
- normalize
- map identifiers
- translate schemas
- transport evidence
- reject forbidden fields

A bridge must not:

- invent XP
- invent rank
- invent scoring rules
- invent athlete identity
- make promotion decisions
- turn recommendations into authoritative outcomes

The Cornerman bridge already states:

Capture → Bridge → Analyze → Develop

and describes the bridge itself as moving reality rather than creating or analyzing it. 

That principle applies ecosystem-wide.

---

# 12. Anti-Drift Rule

Before introducing any new authoritative field, calculation, rule, currency, or business process, development must answer:

**Who owns this truth?**

If an owner already exists, the feature must consume that owner's contract.

If no owner exists, ownership must be assigned before implementation.

A consumer must not permanently implement a competing copy simply because the authoritative system is temporarily incomplete.

Temporary compatibility implementations must be clearly marked and scheduled for retirement.

---

# 13. Source-of-Truth Rule

Repository truth takes priority over memory, old screenshots, stale documentation, duplicated utilities, archived files, and assumptions.

Where two active implementations disagree:

1. identify the intended authoritative owner;
2. preserve production data;
3. establish the correct doctrine;
4. test the authoritative implementation;
5. migrate consumers;
6. retire the duplicate implementation.

Do not resolve drift by arbitrarily choosing whichever copy was modified most recently.

---

# 14. Current Highest-Priority Ownership Conflict

The largest verified violation today is competition logic.

Combat Engine is intended to own sport rules.

Cornerman currently contains independent scoring, referee, result, period, and overtime logic.

Combat Games currently contains independent scoring behavior.

Therefore the Phase 1 ownership decision is:

**Combat Engine is the authoritative sport-rules owner.**

Cornerman and Combat Games become consumers over time.

Existing working implementations remain in place until the Engine supports their required behavior and compatibility tests prove migration safe.

---

# 15. Core Principle

**One truth. One owner. Many consumers.**

Products remain independent where independence creates value.

They integrate through explicit contracts rather than shared assumptions.