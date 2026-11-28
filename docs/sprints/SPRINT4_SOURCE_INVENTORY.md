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

## Important distinction: Spartan six stages versus Vault tracks

The six desired **Spartan Training** stages have not been proven to be identical to six F4/F8 Conditioning segments. F4 and F8 each presently have verified segment files 1–3 only at the inspected paths. This is a *mapping and content-approval gap*, not authorization to generate stages 4–6, copy the F4 program into F8, or remove youth safety gates.

Honor does have six published segment files; still verify the current runtime, chronological release schedule, and Coach review behavior before linking new Athlete OS navigation.

## Read-only inventory executable

Run:

```bash
node scripts/sprint4/inventory-curriculum.mjs
node --test tests/functions/sprint4-curriculum-inventory.test.mjs
```

The script reads only repository JSON files and emits a structured report. Missing stages are reported as missing rather than filled with placeholder lessons. Malformed/duplicate session identifiers are rejected. No services, credentials, production Firestore, or UI routes are accessed.

## Next implementation gates

1. Trace actual canonical curriculum ownership, athlete identity and guardian authorization, all deployed Vault consumers, and live remote-lane submission states. Compare with youth/teen/adult eligibility.
2. Confirm the definition and source-to-stage mapping of Spartan Training 1–6 and approve missing curriculum content *before creating athlete-facing routes or new completion writes*.
3. Confirm whether Daily Habits should reuse an existing athlete-history/submission contract, what Coaches/Parents can see, and which activities are eligible. No implied XP or promotions.
4. Inspect the FuelAI repository's actual data contracts and privacy boundaries. No direct shared writes.
5. Implement a thin, protected Athlete OS slice after these decisions; test in isolated browser and emulators; keep draft until accepted.

**Restrictions:** no production, billing, Stripe, enrollment, release pipeline, ranks, XP, or approved curriculum changes. STOP_NO_RETRY for unresolved security or schema mismatch.
