# Wrestling supervised AUTO staging acceptance

Record the date, reviewer, staging project ID, deployed commit, browser/version, viewport, synthetic account, practice ID, lesson ID, screenshots, callable responses, and relevant Firestore document paths for every run. Stop immediately if the visible STAGING marker or expected staging project ID is absent.

| Scenario | Action | Expected result | Required evidence |
| --- | --- | --- | --- |
| Authorized Coach | Sign in with the synthetic Wrestling Coach. | Coach workspace opens; assigned staging location is available. | Auth UID and visible staging marker. |
| Unauthorized Coach | Sign in with the synthetic outside Coach and request the Wrestling practice. | Request is denied and no lesson record changes. | Permission-denied response and before/after document snapshot. |
| Mixed group | Open the seeded beginner/advanced practice group. | Both athletes load under one canonical practice ID with different instructional tracks. | Group roster, practice ID, and track display. |
| Curriculum inventory | Inspect the family selector. | Exactly 36 Wrestling families are available. | Count plus first/last identifiers. |
| Readiness doctrine | Select families with mandatory and supporting dependencies. | Missing mandatory foundations block advancement; missing supporting skills remain informational. | Readiness response and UI labels. |
| Coach authority | Adjust an athlete track and lesson, then save. | Adjustment persists but execution remains unavailable until explicit confirmation. | Draft response and retrieved draft. |
| Confirmation | Confirm the reviewed plan. | Plan becomes Coach-confirmed exactly once; controls lock. | Confirmation response and saved plan status. |
| Practice attachment | Attach the lesson to the selected practice. | Saved source and attached practice IDs match; another practice is rejected. | Plan document and rejected response. |
| Delivery | Record delivery for authoritative attendees. | Delivery is saved once; no XP, rank, testing, promotion, or skill verification is created. | Plan record and absence checks in affected collections. |
| Refresh/recovery | Refresh after draft, confirmation, and delivery; interrupt one save and retry. | Correct record reloads; identical retry is idempotent; no duplicate lesson appears. | Lesson query/result count and recovered state. |
| Attendance finalization | Add/remove a synthetic athlete, finalize attendance, and retry attachment/delivery. | Finalized `presentIds` is authoritative; stale roster is rejected. | Attendance record and callable response. |
| Historical evidence | Remove, age, or conflict synthetic evidence. | Recommendation fails closed and never enables AUTO. | Blocker codes and unchanged lesson/XP records. |
| Desktop layout | Complete the workflow at a supported desktop viewport. | All controls, readiness columns, confirmation, and recovery remain usable. | Full-page screenshots and browser console. |
| Mobile layout | Repeat at 390×844 or a physical mobile browser. | No inaccessible controls or clipped mandatory/supporting status. | Screenshots and browser console. |

Acceptance requires all rows to pass against the isolated project. Any production project reference, missing staging banner, authorization leak, practice-ID drift, duplicate lesson, or XP/rank/promotion side effect is an automatic rejection. Browser acceptance has not occurred until this table is completed with authenticated evidence.
