/* ============================================================
   inbox-badge.js
   Coach Portal → Inbox Badge Bubble (Unread Count)
   Silent refresh every 5 minutes
   ============================================================ */

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getFirestore,
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ------------------------------------------------------------
   1. FIREBASE INIT (same keys you use elsewhere)
   ------------------------------------------------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyDr8fZgWVCP_qBu2Ev9E2KtVay3lJcWJs4",
  authDomain: "sandmandashboard.firebaseapp.com",
  projectId: "sandmandashboard",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);


/* ------------------------------------------------------------
   2. DOM
   ------------------------------------------------------------ */
const badge = document.getElementById("inbox-badge");

// Stop if badge isn’t on this page
if (!badge) {
  console.warn("Inbox badge element not found.");
}


/* ------------------------------------------------------------
   3. Compute CURRENT month key
   ------------------------------------------------------------ */
function getMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}


/* ------------------------------------------------------------
   4. Load unread count
   ------------------------------------------------------------ */
async function updateInboxBadge() {
  if (!badge) return;

  const monthKey = getMonthKey();
  const colPath = `parentInbox/${monthKey}/entries`;
  
  try {
    const qRef = query(
      collection(db, colPath),
      where("unread", "==", true),
      where("archived", "==", false)
    );

    const snap = await getDocs(qRef);
    const count = snap.size;

    badge.textContent = count > 0 ? count : "";

  } catch (err) {
    console.error("Badge update failed:", err);
  }
}


/* ------------------------------------------------------------
   5. Initial load
   ------------------------------------------------------------ */
updateInboxBadge();


/* ------------------------------------------------------------
   6. Auto-refresh every 5 minutes
   ------------------------------------------------------------ */
setInterval(updateInboxBadge, 300000); // 300,000 ms = 5 min
