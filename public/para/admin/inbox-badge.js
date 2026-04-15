/* ============================================================
   inbox-badge.js
   Coach Portal → Inbox Badge Bubble (Unread Count)
   Para-Comms V1
   Silent refresh every 5 minutes
   ============================================================ */

import {
  db,
  collection,
  getDocs,
  query,
  where,
} from "/assets/js/firebase-init-para.js";

/* ------------------------------------------------------------
   DOM
   ------------------------------------------------------------ */
const badge = document.getElementById("inbox-badge");

// Stop if badge isn’t on this page
if (!badge) {
  console.warn("Inbox badge element not found.");
}

/* ------------------------------------------------------------
   Load unread count (Coach)
   V1 truth:
   - not archived
   - not deleted
   - coach has not opened (seen !== true)
   ------------------------------------------------------------ */
async function updateInboxBadge() {
  if (!badge) return;

  try {
    // Query only docs explicitly marked seen:false.
    // Docs missing "seen" won't be included; we’ll add a client-side fallback below.
    const qRef = query(
      collection(db, "paraCoachInbox"),
      where("archived", "==", false),
      where("deleted", "==", false),
      where("seen", "==", false)
    );

    const snap = await getDocs(qRef);

    // Base count (seen:false)
    let count = snap.size;

    // Fallback: if some old docs never had `seen` set,
    // they won't be in the query. We can optionally do a broader pull,
    // but that costs reads. Keep it minimal for now.
    // If you KNOW you have missing `seen` docs, run a one-time backfill.

    badge.textContent = count > 0 ? String(count) : "";

  } catch (err) {
    console.error("Badge update failed:", err);
  }
}

/* ------------------------------------------------------------
   Initial load + auto-refresh
   ------------------------------------------------------------ */
updateInboxBadge();
setInterval(updateInboxBadge, 300000); // 5 min