# Foundry 8 Curriculum Compatibility Bridge

Policy version: `f8-curriculum-bridge-v1`.

## Existing architecture

The legacy Zero2Hero curriculum is organized by discipline and T0–T7. The youth Arsenal indexes, trainer launchers, skill trees, coach cards, and their completion identifiers use those curriculum tiers directly. The shared combat lock first checks discipline-specific progress (`disciplines`, `combat`, `progression`, or `disciplineProgress`) and historically fell back to the athlete root `tier`.

Before this bridge, the same root `tier` also drove Active Rank XP, testing, and promotion. That became unsafe when Foundry 8 progression changed to five ranks because a promotion could silently change the legacy curriculum route.

## Compatibility model

- `progressionTier`: authoritative Foundry 8 Journey rank, limited to T0–T4.
- `curriculumTier`: legacy curriculum route, valid from T0 through T7.
- `curriculumVersion`: compatibility policy version.
- `tier`: temporary compatibility mirror of `progressionTier` for existing progression readers.

Promotion advances `progressionTier` and its temporary `tier` mirror, while preserving `curriculumTier`. Curriculum routing prefers discipline-specific legacy progress and then `curriculumTier`; it does not read `progressionTier`.

Legacy athletes with only `tier` remain readable without a write: that value can identify their curriculum route. It is accepted as progression only when its T0–T4 tier and stored rank name agree with the new five-rank policy. Invalid or conflicting explicit evidence produces a review-required failure rather than an inferred mapping.

No curriculum content, T5–T7 route, lesson/card identifier, completion record, XP balance, or F4 behavior is reinterpreted by this bridge.
