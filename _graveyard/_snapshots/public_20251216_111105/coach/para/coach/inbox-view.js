/* ============================================================
   inbox-view.js — FINAL (Coach Thread View)
   • Loads parent message + all replies
   • Uses avatar system
   • Unified thread stack
   • Marks unread → read
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, getDocs,
  updateDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ------------------------------------------------------------
   FIREBASE INIT
------------------------------------------------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyDr8fZgWVCP_qBu2Ev9E2KtVay3lJcWJs4",
  authDomain: "sandmandashboard.firebaseapp.com",
  projectId: "sandmandashboard",
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* ------------------------------------------------------------
   DOM HOOKS
------------------------------------------------------------ */
const container     = document.getElementById("thread");
const btnSendReply  = document.getElementById("btn-send-reply");
const btnMarkRead   = document.getElementById("btn-mark-read");
const btnArchive    = document.getElementById("btn-archive");
const btnDelete     = document.getElementById("btn-delete");
const replyBox      = document.getElementById("reply-body");

/* ------------------------------------------------------------
   URL PARAMS
------------------------------------------------------------ */
const urlParams = new URLSearchParams(window.location.search);
const monthKey  = urlParams.get("month");
const msgId     = urlParams.get("id");
/* ------------------------------------------------------------
   Timestamp Dividers
------------------------------------------------------------ */
function makeDivider(label){
  return `
    <div style="
      text-align:center;
      margin:16px 0;
      font-size:.75rem;
      color:#94a3b8;
      letter-spacing:.05em;
    ">
      — ${label} —
    </div>
  `;
}

function dividerFor(date){
  if (!date) return null;

  const d = new Date(date);
  const today = new Date();
  
  const isToday = d.toDateString() === today.toDateString();

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/* ------------------------------------------------------------
   LOAD THREAD (unified)
------------------------------------------------------------ */
async function loadThread() {
  if (!monthKey || !msgId) return;

  const msgRef = doc(db, `parentInbox/${monthKey}/entries`, msgId);
  const msgSnap = await getDoc(msgRef);

  if (!msgSnap.exists()) {
    container.innerHTML = "<p>Message not found.</p>";
    return;
  }

  const data = msgSnap.data();

  // Mark unread → read for coach
  await updateDoc(msgRef, { unread: false });

  let threadHTML = "";

  // Parent original message
  threadHTML += buildThreadMessage({
    from: "parent",
    fromName: data.parentName || "Parent",
    body: data.body_en || data.body || "(no message)",
    createdAt: safeDate(data.createdAt),
  });
// Load replies with dividers
const threadRef = query(
  collection(db, `parentInbox/${monthKey}/entries/${msgId}/thread`),
  orderBy("createdAt", "asc")
);

const snap = await getDocs(threadRef);

let lastDivider = null;

snap.forEach(docSnap => {
  const t = docSnap.data();
  const label = dividerFor(t.createdAt?.toDate?.());

  if (label && label !== lastDivider){
    threadHTML += makeDivider(label);
    lastDivider = label;
  }

  threadHTML += buildThreadMessage({
    from: t.from || "coach",
    fromName: t.fromName || "Coach",
    body: t.text || t.body || "",
    createdAt: safeDate(t.createdAt),
  });
});

// Final render
container.innerHTML = threadHTML;

// Smooth scroll
setTimeout(() => {
  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: "smooth"
  });
}, 80);
}

/* ------------------------------------------------------------
   SEND REPLY
------------------------------------------------------------ */
btnSendReply?.addEventListener("click", async () => {
  const text = replyBox.value.trim();
  if (!text) return;

  const threadPath = `parentInbox/${monthKey}/entries/${msgId}/thread`;
  const newReplyRef = doc(collection(db, threadPath));

  await updateDoc(doc(db, `parentInbox/${monthKey}/entries`, msgId), {
    unread: true,                 // parent sees unread
    lastReplyAt: serverTimestamp()
  }).catch(()=>{});

  await updateDoc(newReplyRef, {
    from: "coach",
    fromName: "Coach",
    body: text,
    text: text,
    createdAt: serverTimestamp()
  }).catch(()=>{});

  replyBox.value = "";
  loadThread();
});

/* ------------------------------------------------------------
   MARK READ
------------------------------------------------------------ */
btnMarkRead?.addEventListener("click", async () => {
  await updateDoc(doc(db, `parentInbox/${monthKey}/entries`, msgId), {
    unread: false
  });
});

/* ------------------------------------------------------------
   ARCHIVE
------------------------------------------------------------ */
btnArchive?.addEventListener("click", async () => {
  await updateDoc(doc(db, `parentInbox/${monthKey}/entries`, msgId), {
    archived: true
  });

  alert("Message archived.");
  window.location.href = "/communications/index.html";
});

/* ------------------------------------------------------------
   DELETE (coach only)
------------------------------------------------------------ */
btnDelete?.addEventListener("click", async () => {
  if (!confirm("Delete this message thread?")) return;

  await updateDoc(doc(db, `parentInbox/${monthKey}/entries`, msgId), {
    deleted: true
  });

  alert("Message deleted.");
  window.location.href = "/communications/index.html";
});

/* ------------------------------------------------------------
   UTIL — Format date
------------------------------------------------------------ */
function safeDate(ts){
  return ts?.toDate ? ts.toDate().toLocaleString() : "";
}

/* ------------------------------------------------------------
   UTIL — Escape HTML
------------------------------------------------------------ */
function escapeHTML(str){
  return str.replace(/[&<>'"]/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;",
    "'":"&#39;", '"':"&quot;"
  })[c]);
}

/* ------------------------------------------------------------
   🔥 AVATAR + MESSAGE BUILDER
------------------------------------------------------------ */
function makeAvatar(name, isCoach){
  const initial = (name || "?").charAt(0).toUpperCase();
  const bg = isCoach ? "#1e3a5f" : "#4b5563";
  const color = "#ffdd48";

  return `
    <div style="
      width:36px;height:36px;border-radius:50%;
      background:${bg};color:${color};
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:1rem;">
      ${initial}
    </div>
  `;
}

function buildThreadMessage(msg){
  const isCoach = msg.from === "coach";
  const avatarHTML = makeAvatar(
    msg.fromName || (isCoach ? "Coach" : "Parent"),
    isCoach
  );

  // Delivered/Seen logic
  let statusHTML = "";
  if (isCoach) {
    if (msg.parentSeen) {
      statusHTML = `<div style="color:#4ade80;font-size:.7rem;margin-top:4px;">Seen</div>`;
    } else {
      statusHTML = `<div style="color:#64748b;font-size:.7rem;margin-top:4px;">Delivered</div>`;
    }
  }

  return `
    <div class="thread-msg ${isCoach ? "coach" : "parent"}">
      <div style="display:flex; align-items:flex-start; gap:12px;">
        ${avatarHTML}
        <div>
          <div class="from">${escapeHTML(msg.fromName || (isCoach ? "Coach" : "Parent"))}</div>
          <div class="timestamp">${msg.createdAt}</div>
          <div class="body">${escapeHTML(msg.body)}</div>
          ${statusHTML}
        </div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------
   INIT
------------------------------------------------------------ */
loadThread();
