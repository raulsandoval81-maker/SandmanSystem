# Sprint 13 development preview

Open index.html in a browser. This standalone file uses a snapshot of selected Academy source content. It lives outside the Hosting public root, performs no network requests and has no runtime service credentials. Synthetic age selectors demonstrate presentation only. Drafts exist in page memory and are cleared on reload.

## Source inventory and gaps

| Surface | Existing implementation | Sprint 13 scope |
| --- | --- | --- |
| Strength | `public/athletes/lanes/strength/strength.js` uses Vault, seasonal context, Conditioning, Iron Work and scheduled release helpers. | Cards use the original Strength Segment 1 words. Youth presentation withholds Iron Work details in a mixed-age view. Workout A declares a minimum age of 13. Existing eligibility remains authoritative. |
| Honor | `public/athletes/lanes/honor/honor.js` loads Vault via `public/vault/vault.js` and resolves active sessions using `public/assets/js/lane-release-schedule.js`. | Cards sample Honor Segment 1. Remaining segments and live assignments are outside this preview. |
| Conditioning and Arsenal | `public/vault/conditioning/f8/course/course.json` and `public/athletes/arsenal/strength/postseason/session/session.js` represent existing course and session surfaces. | No replacement engine and no live course integration. |
| Access, review and XP | `public/assets/js/f8-strength-honor-access.js`, `public/coaches/lanes/strength/review.js`, `public/coaches/lanes/honor/review.js`, and the release helper govern existing access, review timestamps and XP behavior. | No athlete reads, submissions, awards, scheduling or promotion operations. |
| Coach curriculum | Session Builder in `public/coaches/execution/session-builder/` resolves models for AUTO and HYBRID. MANUAL has no approved prescription. The youth wrestling tier wave policy reads the Road2Champion crosswalk in `public/assets/js/hybrid/youth/`. | Read stored youth wrestling foundations and wave order for T0–T4. Flag repeated card IDs and empty groups for review. Draft text is separate from approved content. Teen and adult Coach sequences remain outside this preview. |

## Daily Fuel integration specification

FuelAI source evidence includes TrackWise in `public/assets/js/trackwise.js`, Fuel Log in `public/assets/js/account/fuelai-log.js`, MealWise in `public/assets/js/fuel/app.js` with `meal-history.js`, and photo analysis in `api/analyze.js` with `api/_lib/mealwise-security.js`. TrackWise includes browser storage and target estimation. Fuel Log includes browser persistence, hydration compatibility and retention. MealWise has client history and JPEG preparation. The analysis endpoint authenticates, validates image inputs, and supports multiple modes including CutWise. Those implementations inform the adapter boundary.

- Profile journal entry fields are tenant, athlete, opaque entry ID, local day and timezone, kind (food or hydration), description, optional hydration amount and unit, provenance (manual or confirmed estimate), and server timestamps. Validate units and positive amounts on the server. Use idempotency for create and version checks for updates. Default to a manual journal.
- The youth adapter exposes plain-language food and hydration reflection. Exclude calorie targets, deficit coaching, weight trend scoring and weight-cut modes. Apply age and mode checks server-side. No TrackWise target calculations or existing FuelAI browser-storage keys enter the athlete profile.
- Optional photos require explicit opt-in and an eligible account. Validate size and content type, strip metadata and constrain the processor to food descriptions. Return a transient estimate without automatic logging. Require editing or explicit confirmation before saving any entry. Preserve manual entry when recognition is unavailable. Do not retain raw photos by default. Any retention exception needs a documented consent, expiry and deletion flow before rollout.
- Bind the tenant and athlete from server-verified claims and relationships. Athletes see their own entries. Guardian read access requires an active link plus separate Daily Fuel permission. Coach, Management and unrelated guardians have no access by default. Consent and revocation must be enforced on every read, write and photo-analysis request. Keep content out of logs and analytics. Support scoped export and deletion. Verify cross-tenant and cross-athlete denial, expired links and opt-in revocation before enabling integration.

## Commercial compatibility

| Tier | Experiences | Contract |
| --- | --- | --- |
| CORE | Management + Coach OS | Read approved, versioned curriculum with tenant-scoped role checks. Coach-owned drafts reference the source version and require explicit authorization to publish a new version. |
| PLUS | CORE + Parent and Athlete OS | Read assigned missions and progression via current role and relationship checks. Daily Fuel requires a separate feature gate and the privacy rules above. |
| PRO | PLUS + approved advanced tools and optional integrations | Explicit tenant entitlements and separate integration credentials. |

Reuse the organization-scoped types in `commercial-foundation/src/contracts.ts`. Share versioned curriculum and capability contracts between Academy and Commercial while maintaining independent databases and credentials. Tier entitlement and role authorization are both required. This sprint adds no runtime entitlement or database changes.
