// public/coach/para/coach-inbox-group.js
// ------------------------------------------------------------
// Para-Comms V1 — Load and group coach inbox
// Source: paraCoachInbox (root docs only)
// Groups: family -> athlete
// Filters: archived/deleted hidden by default
// ------------------------------------------------------------

import {
  collection,
  getDocs,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Returns:
 * {
 *   "Sandoval Family": {
 *     familyName: "Sandoval Family",
 *     totalUnread: 3,
 *     familyUnread: 3,              // unread items not tied to a specific athlete
 *     familyThreads: [ ... ],       // root docs without athleteUid
 *     athletes: {
 *       "F8_0001": { athleteUid, athleteName, unread, threads:[...] }
 *     }
 *   }
 * }
 */
export async function loadGroupedCoachInbox({
  db,
  includeArchived = false,
  includeDeleted = false,
} = {}) {
  const families = {};

  // Build query with minimal assumptions.
  // NOTE: If you later add composite indexes, you can tighten these filters.
  const constraints = [
    orderBy("createdAt", "desc"),
  ];

  // Filter out archived/deleted in query when possible
  // (Firestore doesn't support "!= true" well without indexes; safest is filter client-side)
  const q = query(collection(db, "paraCoachInbox"), ...constraints);

  const snap = await getDocs(q);

  snap.forEach((docSnap) => {
    const d = docSnap.data() || {};

    // Client-side hides (V1-safe)
    if (!includeArchived && d.archived === true) return;
    if (!includeDeleted && d.deleted === true) return;

    const familyName = d.familyName || "Family";
    const athleteUid = d.athleteUid || d.athleteId || null;
    const athleteName = d.athleteName || "(Athlete)";

    if (!families[familyName]) {
      families[familyName] = {
        familyName,
        totalUnread: 0,
        familyUnread: 0,
        familyThreads: [],
        athletes: {},
      };
    }

    const fam = families[familyName];

    // Coach unread logic (pick one and stay consistent):
    // - seen === false means coach hasn't opened
    // You can also layer in "unreadForCoach" if you kept it.
    const unreadForCoach =
      d.unreadForCoach === true || d.seen === false;

    const unread = unreadForCoach ? 1 : 0;
    fam.totalUnread += unread;

    const baseThread = {
      id: docSnap.id,
      unreadForCoach,
      lastSender: d.lastSender || d.fromName || "",
      lastReplyAt: d.lastReplyAt || d.createdAt || null,
      createdAt: d.createdAt || null,
      scope: athleteUid ? "athlete" : "family",
      athleteUid: athleteUid || undefined,
      data: d,
    };

    // If tied to athlete, group under athlete
    if (athleteUid) {
      if (!fam.athletes[athleteUid]) {
        fam.athletes[athleteUid] = {
          athleteUid,
          athleteName,
          unread: 0,
          threads: [],
        };
      }
      fam.athletes[athleteUid].unread += unread;
      fam.athletes[athleteUid].threads.push(baseThread);
    } else {
      // No athleteUid => treat as family/general thread
      fam.familyUnread += unread;
      fam.familyThreads.push(baseThread);
    }
  });

  return families;
}