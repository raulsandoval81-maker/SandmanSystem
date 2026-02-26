// public/assets/js/dev-roster.js
// ✅ Unified DEV/LIVE source of truth = isDevMode() from dev-mode.js
// ✅ Provides query + client-side guard helpers used across pages
// ✅ LIVE strips devMode/isTest client-side (no index required)
// ✅ DEV query: devMode==true AND isTest==true (indexed)

import { collection, query, where, limit } from "/assets/js/firebase-init.js";
import { isDevMode } from "/assets/js/dev-mode.js";

/**
 * Returns a Firestore query for the athletes roster.
 * DEV: only dev/test docs (requires composite index)
 * LIVE: broad query (limit only) + client-side strip (no index required)
 */
export function rosterQuery(db, { pageLimit = 300 } = {}) {
  const devMode = isDevMode();
  const baseRef = collection(db, "athletes");

  if (devMode) {
    return query(
      baseRef,
      where("devMode", "==", true),
      where("isTest", "==", true),
      limit(pageLimit)
    );
  }

  // LIVE: keep query simple; enforce lens with stripDevDocsIfLive()
  return query(baseRef, limit(pageLimit));
}

/**
 * Client-side safety filter:
 * - In LIVE lens: remove dev/test docs
 * - In DEV lens: return list untouched
 *
 * Accepts either:
 *  A) [{ id, ...data }] (snapshot-mapped roster)
 *  B) [{ id, data }]    (getDocs mapped wrapper)
 */
export function stripDevDocsIfLive(list = []) {
  if (isDevMode()) return list;

  return list.filter((x) => {
    const d = x?.data ? x.data : x; // supports both shapes
    return !(d?.devMode === true || d?.isTest === true);
  });
}

/**
 * Canonical-only filter should not be active in DEV lens.
 */
export function canonicalOnlyEnabled(toggleChecked) {
  return isDevMode() ? false : !!toggleChecked;
}

/**
 * Guard a single athlete doc against LIVE lens.
 * Use this in profile pages after you read snap.data().
 */
export function guardDocIfLive(a) {
  if (isDevMode()) return { ok: true };
  if (a?.devMode === true || a?.isTest === true) {
    return { ok: false, reason: "DEV_ONLY" };
  }
  return { ok: true };
}
