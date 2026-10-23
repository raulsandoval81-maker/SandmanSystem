# XP client recovery inventory

All production-facing Coach XP writes remain routed through the existing authoritative XP service. This change does not alter XP values, caps, rank thresholds, staff permissions, or Cloud Run IAM.

## Active HTTP clients

Daily Grind, Attendance review, Weekend Arena, Duel Arena, Declared Championship, Arena Log, Conditioning review, Strength review, and Honor review submit through `/xp` using `postAuthoritativeXp`. The shared client requires an active non-anonymous Firebase Coach/Admin session, obtains the Firebase ID token, and sends it as a Bearer token. It treats either an HTTP failure or an application `ok: false` response as failure.

## Active callable clients

Championship Arena submits through `awardXP` and the `incrementXp` callable. The shared callable gateway now invokes `requireCoach` before submission; Firebase Functions supplies the signed session token to the callable.

## Retired and non-production paths

- `public/coaches/tools/coach-daily.html` is a legacy bulk Attendance shortcut that cannot supply authoritative attendance evidence. It remains in source for historical reference, but the active Tools navigation now routes to canonical Daily Grind.
- `public/coaches/tools/coach-weekly.html` is an owner-confirmed placeholder. Its existing page and navigation link are preserved unchanged, and it is excluded from V1 XP release certification.
- `public/dev/` XP tools are development-only and are not production Coach entry points.
- `public/assets/js/service.js` exposes an unused legacy callable wrapper; no active page imports it.

## Staging acceptance

Use synthetic staging athletes only. For every active lane, confirm: unauthenticated rejection; non-Coach rejection; out-of-scope rejection; authorized award amount; applicable daily/monthly cap; identical retry idempotency; receipt/state agreement; and UI success/failure matching the server response. Verify production project IDs and resources are absent from the staging configuration before and after the run.

## Rollback

Revert the implementation commit and redeploy only the prior approved staging SHA through the existing exact-SHA staging workflow. No IAM rollback is required because this change does not modify IAM. Do not promote or deploy the reverted build to production without the normal release approval.
