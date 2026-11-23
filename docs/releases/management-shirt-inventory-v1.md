# Sandman Management · Shirt Inventory V1

**Status:** coded for review; not deployed until the protected release executes.

- Location: `santa-ynez-valley`; opening physical count November 23, 2026.
- Opening stock: 22 variants, 147 shirts (84 Youth, 63 Adult). The import button is owner-confirmed and **idempotent**. It checks a unique opening marker and fails closed if any opening stock already exists.
- Youth sizes: XS, S, M, L, XL. Youth 2XL/3XL are invalid in policy and UI.
- Adult sizes: XS, S, M, L, XL, 2XL, 3XL. Adult White 2XL = 6.
- Gray shirts are Apprentice; other colors remain unconfirmed rank descriptions until owner approval. No assumed rank assignment.
- Callable: `managementShirtInventory`, Gen2 `us-central1`, maxInstances 20, with active Management authorization and per-location scope verification.
- Data: `management_inventory/{locationId}/stock/{variant}`, `movements/{operationId}` and `opening/2026-11-23`.
- Operations: list; import-opening; received; issued; returned; damaged; signed correction.
- Every movement uses an atomic stock update and immutable audit event. Caller provides a UUID request ID to prevent accidental duplicate writes. Insufficient stock is rejected.
- Athlete issuance may link an existing verified `athletes/{athleteId}` at the same location. Operational unassigned issues require a reason.
- These operations do **not** modify rank, XP, enrollment, billing, Stripe or attendance.
- Only backend Admin SDK writes to `management_inventory`; no new client-side Firestore rule allows inventory mutations.
- The release is a **single new callable + six-file Hosting overlay**, never a full-site deploy. Do not deploy or seed merely because this PR merges.
- For production: protected workflow on `main`, `preflight` first, explicit environment approval and `deploy` selection after preflight. STOP_NO_RETRY on unexpected state.
- Post-release: staff sign-in, verify `/management/inventory/`, confirm opening import once, then re-read total 147 and audit trail.

## Manual smoke test (staging/approved production)
1. Unauthenticated and Coach users cannot list or adjust stock.
2. Management with wrong location cannot list or write.
3. Initial import = 147 and repeating import does not increase stock.
4. Youth 2XL/3XL rejected; Adult White 2XL accepted.
5. Issue one shirt to existing athlete, confirm count −1 and immutable ledger record; retry same operation ID yields no second decrement.
6. Issue more than on hand is denied; return +1 restores count.
7. Verify unrelated XP, rank, billing and payment data unchanged.
