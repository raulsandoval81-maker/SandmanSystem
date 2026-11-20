# XP entrypoint reconciliation — read-only source audit (2026-11-20)

**Status: production NO-GO.** This branch changes no deployed XP logic. This report describes source, not live behavior.

## Source-backed inventory

| Entry point | Client | Backend | Key behavior |
| --- | --- | --- | --- |
| Admin | `public/admin/system/xp-adjustments.page.js` | `public/admin/services/admin.service.js` | Reads `athletes/{uid}`, calculates `Math.max(0, xp + amount)`, updates athlete and separately adds `xpLogs` record. |
| Management | `public/management/xp-adjustments/xp-adjustments.js` | `functions/src/management/managementXpTools.ts` | Calls `createManagementXpAdjustment`; staff and location checks, transaction, discipline authority, lifetime effects, idempotency receipt. |
| Coach | coach XP clients | `functions/src/modules/xpHttp.ts` → `functions/src/services/authoritativeXpService.ts` | Authenticated, coach/athlete access checked; authoritative XP dispatcher and transaction. |

## Confirmed gaps

1. **Admin is not the shared authoritative implementation.** It writes `athletes.xp` directly from the browser. The admin screen is a functional reference, not a safe implementation to copy.
2. **Admin's athlete update and audit log are separate writes.** If the second operation fails, the first may already have succeeded.
3. **Admin does not visibly enforce the same server-side discipline, active-rank cap, lifetime XP, or idempotency receipt rules as Management.** Firestore security rules and live behavior still need separate verification.
4. **Management's current handler rejects nonpositive effective XP changes** (`delta <= 0` → `XP_CAP_REACHED`), while Admin accepts negative amounts and floors the result at zero. Management cannot be claimed to have Admin's deduction parity.
5. **Log schemas differ.** Admin writes `xpLogs`; Management writes canonical and compatibility logs and receipts. Cross-interface history needs explicit reconciliation before any migration.
6. **Coach and Management are not the same function**, even though they import shared authoritative XP helpers. Their policies must be compared for every adjustment semantic.

## Release prerequisites

- Agree on a canonical server-side adjustment contract: actor role, athlete ID, discipline, signed delta, reason, semantic, stable adjustment ID, result and receipt.
- Define signed-deduction semantics and protection against undoing earned lifetime XP, stripes, ranks, and previously issued recognition. Never assume `Math.max(0, xp + delta)` is sufficient.
- Preserve Admin's accountability and transition metadata, and ensure old `xpLogs` consumers remain compatible.
- Add emulator-backed tests for Admin/Management/Coach parity: positive award, deduction, cap, non-primary discipline, frozen athlete, concurrent requests, duplicate ID, unauthorized actor, cross-location access, and failed audit write.
- Inspect Firestore rules and production logs read-only; validate Admin's current live behavior without sending a test award.
- Resolve draft PR #734's serving-image provenance and independent rollback requirements before any Management production release. Do not rerun failed protected workflows without separate authorization.

## Safety

No production writes, test awards, merges, deployments, IAM edits, Storage copies, or protected workflow reruns are authorized by this audit. This document and the companion test capture current differences; they do **not** claim feature parity or release readiness.
