// public/coach/para/inbox-receipt.js

import {
  db,
  auth,
  doc,
  getDoc
} from "/data/firebase-init.js";

// URL is inbox-receipt.html?month=2025-11&id=ABC123
const params = new URLSearchParams(location.search);
const month = params.get("month");
const id = params.get("id");

async function load() {
  const ref = doc(db, `parentInbox/${month}/entries/${id}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();

  // Parent’s message
  document.getElementById("parent-msg").textContent = data.message || "(empty)";

  // Coach reply if exists
  if (data.coachReply) {
    document.getElementById("coach-reply").textContent = data.coachReply.body;
  } else {
    document.getElementById("coach-reply").textContent = "(No reply yet)";
  }
}

load();
// public/coach/para/inbox-receipt.js
// Pilot mode: no DB reads. Just confirm page loaded.

console.log("[Para-Comms] Receipt page loaded.");
