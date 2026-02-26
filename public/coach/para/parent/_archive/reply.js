// ------------------------------------------------------------
// Parent Reply System (Pilot Mode) — Polished Final
// ------------------------------------------------------------
import {
  db,
  serverTimestamp,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
} from "/data/firebase-init-para.js";

const params = new URLSearchParams(location.search);
const msgId = params.get("id");

const input     = document.querySelector("#reply-input");
const btn       = document.querySelector("#btn-reply");
const threadBox = document.querySelector("#thread-box");

// ------------------------------------------------------------
// Bubble Renderer (clean, consistent)
// ------------------------------------------------------------
// ------------------------------------------------------------
// BUBBLE RENDERER — Level 3 Polish
// ------------------------------------------------------------
function addBubble(from, body, ts = new Date()) {

  // Normalize label + class
  const isCoach = from === "coach" || from === "Coach";
  const label = isCoach ? "Coach" : "You";
  const cls = isCoach ? "coach" : "parent";

  // Defensive formatting
  const safeText = (body || "").replace(/\n/g, "<br>");
  const stamp = ts ? ts.toLocaleString() : "";

  const div = document.createElement("div");
  div.className = `thread-block ${cls} fade-in`;

  div.innerHTML = `
    <div class="sender">${label}</div>
    <div class="body">${safeText}</div>
    <div class="timestamp">${stamp}</div>
  `;

  threadBox.appendChild(div);

  // Always scroll to newest message
  setTimeout(() => {
    threadBox.scrollTop = threadBox.scrollHeight;
  }, 50);
}

// ------------------------------------------------------------
// Load Original Message + Replies
// ------------------------------------------------------------
async function loadThread() {
  const ref = doc(db, "paraCoachInbox", msgId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    threadBox.innerHTML = "<p>Message not found.</p>";
    return;
  }

  const data = snap.data();

  // ---- Original Parent Message ----
  addBubble("parent", data.body, data.createdAt?.toDate());

  // ---- Load Replies Subcollection ----
  const threadRef = collection(db, "paraCoachInbox", msgId, "thread");
  const qSnap = await getDocs(threadRef);

  // Sort replies chronologically
  const replies = qSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)
    );

  replies.forEach(r => {
    const role = r.from?.toLowerCase() === "coach" ? "Coach" : "Parent";
    addBubble(role, r.body, r.createdAt?.toDate());
  });

  // Auto-scroll to bottom
  threadBox.scrollTop = threadBox.scrollHeight;
}

loadThread();

// ------------------------------------------------------------
// SEND REPLY (Parent → Coach)
// ------------------------------------------------------------
btn.addEventListener("click", async () => {
  const body = input.value.trim();
  if (!body) return;

  const threadRef = collection(db, "paraCoachInbox", msgId, "thread");

  // Write to Firestore
  await addDoc(threadRef, {
    from: "parent",
    body,
    createdAt: serverTimestamp()
  });

  // Show instantly in UI
  addBubble("parent", body);

  input.value = "";
  input.focus();

  // Auto-scroll after sending
  threadBox.scrollTop = threadBox.scrollHeight;
});
