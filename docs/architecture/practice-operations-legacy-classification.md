# Practice Operations legacy assertion classification

The five assertions below reproduce before Phase 4 and do not exercise the Group Lessons callable. Phase 4 leaves their implementation untouched and records the minimal follow-up instead of changing adjacent production behavior.

| Assertion | Current behavior | Canonical assessment | Minimal correction |
| --- | --- | --- | --- |
| Clipboard drill blocks preserve entry modes | Entry modes are `auto`, `hybrid`, `manual`, `checked-in`, `quick`; the assertion requires a stale order beginning with `checked-in`. Drill-block persistence tests pass. | Test is incorrect; array order is not a policy guarantee. | Assert set membership instead of source-text ordering. |
| Rooms carry canonical location identity | Room IDs and location IDs are canonical. Labels are `Mat 1 · Session A/B`, while the assertion expects `Lompoc Mat 1`. | Test is incorrect for identity; label copy is presentational. | Assert identity fields separately and update the approved label expectation after product review. |
| Practice route/attendance/Clipboard screen sequence | Builder still routes to attendance and Clipboard. Attendance no longer contains the five hard-coded vowel quick-search buttons expected by the assertion. | Sequence remains intact; assertion mixes navigation with retired UI markup. | Split navigation assertions from optional attendance-search UI tests. |
| Auto/Hybrid/Manual focus tier and week | Guided modes remain available, but the assertion expects retired helper names and exact copy strings. | Test is stale unless Product explicitly restores the old suggestion UI. | Test observable mode behavior, not private helper names or copy. |
| Canonical practice ID survives Clipboard, Clock, Companion, and Practice Log | All four surfaces carry `practiceId`; Companion now normalizes `payload.practiceId || live.practiceId` rather than the older `session?.practiceId` expression. | Test is incorrect; current hydration is at least as strict and Practice Log refuses fabricated identity. | Assert normalized payload behavior or the accepted source forms instead of one source expression. |

The canonical practice-ID assertion is adjacent to Wrestling integration, so the Phase 4 Firestore tests remain the authoritative release gate: lesson creation, confirmation, attachment, delivery, retrieval, cross-practice rejection, attendance changes, and idempotent recovery all operate on the server-owned practice ID.
