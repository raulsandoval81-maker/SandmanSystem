# Local Program Engine — Working Requirements

## Current presentation source of truth

### Program family and route compatibility

`Sandman Zero2Hero™ Programs` is the public program family.

Its youth journey is `Road2Champion™` for ages 7–13. The internal
configuration key and established public route segment remain `zero2hero`,
including `/programs/zero2hero/...` URLs. Templates must not use
`Zero2Hero™` as the visible youth journey label.

The approved Submission Grappling output slug is `submission-grappling`.
The generator explicitly maps that output to the legacy library source file
`quest2mastery/sub-grappling.html` until the source filename can be migrated
with separate compatibility review.

### Local homepage
Each academy homepage displays only the disciplines actually enabled
for that location.

Homepage discipline cards route to the appropriate journey section
on that location's Programs page.

### Programs page hierarchy

Programs pages are journey-first, not discipline-first.

Road2Champion:
- youth ages 7–13
- rank badges
- enabled youth disciplines

Path2Legend:
- ages 14+
- rank badges
- enabled teen disciplines

Quest2Mastery:
- ages 16+
- rank badges when available
- Mixed Martial Arts
- Submission Grappling where enabled

Fitness:
- academy identity seal
- In-Person Training
- Remote Training

Do not stack Wrestling, Muay Thai, MMA, etc. as independent journey
sections underneath the real journey sections.

## Fitness routing

Programs > Fitness > In-Person Training:
- routes to the location's canonical fitness.html
- public concept is Everyday Fitness

Programs > Fitness > Remote Training:
- routes directly to FuelAI
- it is not another local Everyday Fitness page

## Everyday Fitness presentation

Elk Grove fitness.html is currently the visual/style reference.

Location content is configuration-driven.

Where Everyday Fitness is enabled, possible class offerings include:
- 45-minute HIIT Strength & Conditioning
- 45-minute HIIT Kickboxing & Self-Defense
- 45-minute HIIT Boxing & Self-Defense

Possible enrollment information:
- $15 drop-in
- if the person enrolls, the $15 drop-in rolls into the enrollment fee

These details should render only when that location actually offers them.

A location with no active Everyday Fitness offering should not falsely
display class schedules, drop-in pricing, or enrollment promises.

## Fitness visual identity

Programs Fitness section uses:
- Sandman Academy of Combat & Fitness seal
- no rank ladder
- no discipline-specific progression PNG

Asset:
`/assets/img/brand/sandman-academy-combat-fitness-spartan-seal.png`

## Deeper progression visuals

Programs page:
- badges / journey overview

Deeper discipline page:
- discipline explanation
- shirt progression / discipline-specific visual where approved

Do not place the large MMA progression artwork on the Programs overview.

## Current location alignment work

Elk Grove:
- visual source of truth for Everyday Fitness styling
- local offerings may differ

Lompoc:
- uses Elk Grove Everyday Fitness visual system
- active class descriptions are shown when offered
- $15 drop-in
- if the person enrolls, the $15 rolls into the enrollment fee
- location pages must inherit the canonical local shell for navigation,
  language state, theme state, and footer behavior

Santa Ynez Valley:
- uses the approved Everyday Fitness presentation system
- 45-minute HIIT class descriptions remain location-configured
- $15 drop-in
- if the person enrolls, the $15 rolls into the enrollment fee
- local shell inherits shared navigation, language, theme, and footer behavior

## Engine requirement

Future local-program generation must separate:

1. visual template
2. enabled journeys
3. enabled disciplines
4. enabled fitness modes
5. class offerings
6. pricing/drop-in availability
7. deeper page routes

Presentation must not imply that a program is offered merely because
the shared system supports that program.


## Public language and appearance preferences

Public preference controls follow one shared rule:

- The main public entry/home page visibly presents English / Español.
- The main public entry/home page visibly presents Day / Night.
- Each academy/location index page also visibly presents English / Español and Day / Night.
- Interior location pages do not repeat those controls.
- The selected language persists through `language.js`.
- The selected appearance persists through `theme.js`.
- Interior public pages inherit the saved selections automatically.
- Full language and appearance toggles should not be duplicated in every page header.
- Local pages must load the canonical shared language and theme scripts.
- Navigation may later expose a small Preferences area for changing an existing choice.
- Until that Preferences treatment is intentionally designed, the public homepage remains the primary visible preference control.
- Generated local pages must never implement separate page-specific preference state.

## Generated discipline interior shell

Generated discipline-detail pages use the location navigation component at
`/locations/<slug>/components/navigation.html` and the shared global footer at
`/components/footer.html`. The generator removes the legacy embedded
`journey-minimal-header`; interior pages inherit language and appearance through
the existing shared scripts without rendering a second set of preference controls.

Road2Champion progression runs from Shadow to Champion and uses the canonical
`/assets/images/programs/shirt-progression/road2champion-*-shirt-progression.png`
assets. Path2Legend uses the equivalent canonical `path2legend-*` assets.
