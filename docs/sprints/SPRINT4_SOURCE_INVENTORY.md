# Sprint 4 — Verified source inventory and engineering boundaries

**Scope:** preparatory, read-only; not a production release and not a replacement curriculum.

## Verified at repository paths

| Component | Confirmed code/content | Constraint |
| --- | --- | --- |
| Athlete Home Base and navigation | `public/athletes/hub/`, `public/assets/js/athlete-nav.js` | Ownership-verified athlete routes; retain mini/full experiences and EN/ES preferences |
| Athlete Arsenal | `public/athletes/arsenal/arsenal.html`, `mini-arsenal.html` | Preserve Combat, Strength, Honor |
| Honor / Character stages 1–6 | `public/vault/honor/segment1…segment6/sessions.json` | Content exists; titles in source: Self, Partner & I, Team, Partner & I, Competition & I, Leadership & I, Legacy & I. Do not relabel or rewrite before curriculum approval |
| F4 Conditioning | `public/vault/conditioning/f4/segment1…segment3/sessions.json` | Stages 4–6 not found at corresponding Vault paths |
| F8 Conditioning | `public/vault/conditioning/f8/segment1…segment3/sessions.json` | Stages 4–6 not found at corresponding Vault paths |
| Existing athlete delivery | `public/athletes/lanes/f4-conditioning/f4-conditioning.js`, `f8-conditioning/f8-conditioning.js`, `honor/honor.js` | Existing remote session/submission and authorization logic must be reused, not duplicated |
| Eligibility | `public/athletes/arsenal/unlocks.json`, `public/assets/js/f8-strength-honor-access.js` | Before Tier 3, youth Strength/Honor remain Coach-led; remote assignment stays restricted |
| Coach verified skill | `functions/src/modules/skillCheckCoachCall.ts` | Coach assessments are practice evidence, not blanket daily-habit verification |
| System ownership | `docs/architecture/SYSTEM_OWNERSHIP_DOCTRINE.md` | Sandman owns development and XP/ranks; FuelAI retains wellness/nutrition intelligence |
| Daily Habits | References in Honor sessions, but no complete independent tracking contract verified | Do not invent persistence, access control, XP awards, or streak penalties |
| FuelAI / TrackWise | FuelAI marketing links, owner doctrine, standalone `FuelAI` repository | Cross-product read-only and versioned evidence handoff only after verified contract; no production coupling |

## Approved Sprint 4 mapping — Spartan replaces Conditioning presentation

Owner decision, November 28, 2026:

- **Spartan Levels 1–3** replace the separate F4 and F8 Conditioning presentation. Reuse each existing track's three segment curriculum files as source content.
- **Spartan Levels 4–6** are future curriculum to develop and approve independently for youth and teen/adult. Never fabricate, auto-unlock, or alias missing levels.
- **All participants start the *new Spartan pathway* at Level 1**, regardless of their current Sandman Journey tier, rank, or how far they progressed through legacy Conditioning. Existing rank, XP, historical Conditioning evidence and timestamps are never reset or deleted.
- Keep age-appropriate exercise lists: F8 is the youth routine source; F4 is the teen/adult routine source. Do not copy adult workouts into youth.
- Preserve source interval timing, round counts, exercises and release sequences unless a specific training change is approved. F8 source interval keys are `work/rest`, while F4 uses `workSec/restSec`. The new read-only adapter normalizes both into `workSec/restSec` while retaining original source.
- The entry-level decision **does not grant independent remote access** to an otherwise ineligible athlete. Maintain existing Coach-led youth protections and approved assignment/approval gates.
- Spartan has its own new progression namespace once safely implemented. Old `laneSubmissions` conditioning history stays readable and immutable; never infer new Spartan completions from it or wipe it.
- `public/assets/js/spartan-curriculum.js` is currently a **pure mapping and session normalization adapter**, not an enabled runtime route, datastore migration, Coach approval change, or source of XP.

This mapping is approved. Integration remains pending consumer audit (especially current Conditioning session selection, submitted status keys, Coach review and youth eligibility).

## Read-only inventory executable

Run:

```bash
node scripts/sprint4/inventory-curriculum.mjs
node --test tests/functions/sprint4-curriculum-inventory.test.mjs tests/functions/spartan-curriculum.test.mjs
```

The script reads only repository JSON files and emits a structured report. Missing stages are reported as missing rather than filled with placeholder lessons. Malformed/duplicate session identifiers are rejected. No services, credentials, production Firestore, or UI routes are accessed.

## Next implementation gates

1. Trace actual canonical curriculum ownership, athlete identity and guardian authorization, all deployed Vault consumers, and live remote-lane submission states. Compare with youth/teen/adult eligibility.
2. Use the approved Spartan 1–3 source mapping, while separately developing/approving missing Levels 4–6 content *before releasing those levels or any new completion writes*.
3. Confirm whether Daily Habits should reuse an existing athlete-history/submission contract, what Coaches/Parents can see, and which activities are eligible. No implied XP or promotions.
4. Inspect the FuelAI repository's actual data contracts and privacy boundaries. No direct shared writes.
5. Implement a thin, protected Athlete OS slice after these decisions; test in isolated browser and emulators; keep draft until accepted.

**Restrictions:** no production, billing, Stripe, enrollment, release pipeline, ranks, XP, or approved curriculum changes. STOP_NO_RETRY for unresolved security or schema mismatch.
