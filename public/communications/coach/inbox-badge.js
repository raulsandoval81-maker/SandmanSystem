/* ============================================================
   inbox-badge.js
   Coach Portal → Inbox Badge Bubble
   Para-Comms V1
   Counts NEW/PENDING requests only.
   Auto refresh every 5 minutes.
============================================================ */

import {
  db,
  collection,
  getDocs,
  query,
  where
} from "/assets/js/firebase-init-para.js";

/* ------------------------------------------------------------
   DOM
------------------------------------------------------------ */

const badge = document.getElementById("inbox-badge");

if (!badge) {
  console.warn("Inbox badge element not found.");
}

/* ------------------------------------------------------------
   Update Badge
------------------------------------------------------------ */

async function updateInboxBadge() {

  if (!badge) return;

  try {

    const qRef = query(
      collection(db, "paraParentInbox"),
      where("status", "==", "pending"),
      where("coachHasUnread", "==", true)
    );

    const snap = await getDocs(qRef);

    const count = snap.size;

    badge.textContent = count > 0 ? String(count) : "";
    badge.style.display = count > 0 ? "inline-flex" : "none";

  } catch (err) {

    console.error("Inbox badge update failed:", err);

    badge.textContent = "";
    badge.style.display = "none";

  }

}

/* ------------------------------------------------------------
   Initial Load
------------------------------------------------------------ */

updateInboxBadge();

/* ------------------------------------------------------------
   Refresh Every 5 Minutes
------------------------------------------------------------ */

setInterval(updateInboxBadge, 300000);