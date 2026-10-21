# Sandman V1 — Shared practice execution decision (20 Oct 2026)

**Status:** Implementation foundation in draft PR. No UI wiring, staging deployment, or production change authorized by this document.

## Locked architecture

Session Builder defines the class, groups and allotted duration. Pre-Practice Clipboard selects Skill Cards, Drill Blocks, combat interval presets, audio settings and Coach overrides. One pure practice execution contract compiles the plan into a timed event sequence. **Big Clock** is a visual-plus-audio player; **Audio Only** will be a separate lightweight player, not a hidden Big Clock. Both must consume the same event sequence and preserve the canonical practice closeout.

## Inheritance and precedence

* Skill Cards supply technique labels and coaching cues, not timing.
* Drill Blocks supply drill name, duration, and coaching/flow cues.
* Combat timer execution settings supply rounds, work, rest, warnings and associated skill IDs.
* Clipboard block allocation and the overall practice clock constrain timing.
* Explicit Coach changes to the live run must be recorded as overrides; never silently rewrite original curriculum or canonical planned memory.
* When no explicit interval execution specification is available, legacy timer pack/preset/label is display metadata only. Do not guess timings from preset names.
* Over-allocated drills or intervals are errors to resolve rather than silently clipping a drill or adding time to the class.
* HYBRID shared core skills should be announced once per room with group-specific instructions displayed as needed, without certifying athlete progression.

## Audio modes

Big Clock can retain current beep cues. Future voice events must be gated by deliberate user audio activation and have mute, pause, skip, and repeat control. Audio Only should allow basic control without the large display, sharing time calculations and events with Big Clock. No automatic app/background audio guarantees are assumed.

## Required next integration work

1. Confirm the PR #193/#194 staging release actually serves the new Clipboard assets.
2. Map existing timer presets to explicit executable contracts and add Clipboard editing/validation, with schema backward compatibility.
3. Connect approved Skill Cards to Drill Blocks and consolidated HYBRID group cue payloads.
4. Refactor Big Clock 2.0 to consume the shared timeline, then add spoken cues.
5. Build a separate Audio Only interface consuming that timeline.
6. Validate start, pause, resume, skip, extension, repeat, completion and closeout with synthetic data; check browser audio restrictions and cross-device handoff.
7. Preserve attendance, XP, testing, AUTO evidence checks and all existing practice security gates.

Implementation in this PR is **foundational only**: a pure module plus tests and this decision record. It does not claim working UI features.
