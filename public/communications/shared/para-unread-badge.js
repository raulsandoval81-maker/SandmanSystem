// para-unread-badge.js
// Reads parentInbox/{authUID}/{YYYY-MM}/... to detect unread messages.

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { monthKey } from "./para-message-engine.js";

export async function getParentUnreadCount({ db, authUid }) {
  const key = monthKey();
  let total = 0;

  // FAMILY THREADS
  const famCol = collection(db, "parentInbox", authUid, key, "family");
  const famSnap = await getDocs(famCol);
  famSnap.forEach(docSnap => {
    const d = docSnap.data();
    if (d.unreadForParent) total++;
  });

  // ATHLETE THREADS
  const athleteRoot = collection(db, "parentInbox", authUid, key, "athletes");
  const athleteFolders = await getDocs(athleteRoot);

  for (const folder of athleteFolders.docs) {
    const athleteUid = folder.id;
    const entriesSnap = await getDocs(
      collection(db, "parentInbox", authUid, key, "athletes", athleteUid, "entries")
    );
    entriesSnap.forEach(es => {
      const d = es.data();
      if (d.unreadForParent) total++;
    });
  }

  return total;
}

export async function paintParentBadge({ db, authUid }) {
  const count = await getParentUnreadCount({ db, authUid });

  const badge = document.getElementById("parent-inbox-badge");
  if (!badge) return;

  if (count > 0) {
    badge.style.display = "inline-block";
    badge.textContent = "NEW";
  } else {
    badge.style.display = "none";
  }
}
