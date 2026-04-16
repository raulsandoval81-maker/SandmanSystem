// ----------------------------------------------------------
// coach-thread.js — Coach view of one parent message thread
// ----------------------------------------------------------

// ✅ Golden import for Coach Para-Comms Thread View
import {
  db,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "/data/firebase-init.js";

// DOM
const container    = document.getElementById("thread-container");
const replyBox     = document.getElementById("reply-body");
const btnSendReply = document.getElementById("btn-send-reply");
const btnArchive   = document.getElementById("btn-archive");
const btnDelete    = document.getElementById("btn-delete");

// URL params
const params   = new URLSearchParams(window.location.search);
const monthKey = params.get("month");
const msgId    = params.get("id");

// Helpers -----------------------------------------------

function safeDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : ts;
  return d.toLocaleString();
}

function escapeHTML(str = "") {
  return String(str).replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[c]);
}

function makeAvatar(name, isCoach) {
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

function buildThreadMessage(msg) {
  const isCoach = msg.from === "coach";
  const avatarHTML = makeAvatar(
    msg.fromName || (isCoach ? "Coach" : "Parent"),
    isCoach
  );

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
      <div style="display:flex;align-items:flex-start;gap:12px;">
        ${avatarHTML}
        <div>
          <div class="from">
            ${escapeHTML(msg.fromName || (isCoach ? "Coach" : "Parent"))}
          </div>
          <div class="timestamp">${safeDate(msg.createdAt)}</div>
          <div class="body">${escapeHTML(msg.body || "")}</div>
          ${statusHTML}
        </div>
      </div>
    </div>
  `;
}

function makeDivider(label) {
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

function dividerFor(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : (date.toDate ? date.toDate() : new Date(date));

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

// Load thread --------------------------------------------

async function loadThread() {
  if (!container) return;
  if (!monthKey || !msgId) {
    container.innerHTML = "<p>Message not found.</p>";
    return;
  }

  const msgRef = doc(db, "parentInbox", monthKey, "entries", msgId);
  const msgSnap = await getDoc(msgRef);

  if (!msgSnap.exists()) {
    container.innerHTML = "<p>Message not found.</p>";
    return;
  }

  const data = msgSnap.data();

  // mark as read for coach
  try {
    await updateDoc(msgRef, { unread: false });
  } catch (err) {
    console.warn("Could not mark as read:", err);
  }

  let html = "";

  // original parent message
  html += buildThreadMessage({
    from: "parent",
    fromName: data.parentName || "Parent",
    body: data.body_en || data.body || "(no message)",
    createdAt: data.createdAt
  });

  // replies subcollection
  const threadCol = collection(db, "parentInbox", monthKey, "entries", msgId, "thread");
  const qRef = query(threadCol, orderBy("createdAt", "asc"));
  const snap = await getDocs(qRef);

  let lastDivider = null;

  snap.forEach(docSnap => {
    const t = docSnap.data();
    const dateObj = t.createdAt?.toDate ? t.createdAt.toDate() : null;
    const label = dividerFor(dateObj);

    if (label && label !== lastDivider) {
      html += makeDivider(label);
      lastDivider = label;
    }

    html += buildThreadMessage({
      from: t.from || "coach",
      fromName: t.fromName || (t.from === "coach" ? "Coach" : "Parent"),
      body: t.text || t.body || "",
      createdAt: t.createdAt,
      parentSeen: t.parentSeen === true
    });
  });

  container.innerHTML = html;

  // scroll to bottom
  setTimeout(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }, 80);
}

// Send reply ---------------------------------------------

if (btnSendReply && replyBox) {
  btnSendReply.addEventListener("click", async () => {
    const text = replyBox.value.trim();
    if (!text || !monthKey || !msgId) return;

    const msgRef = doc(db, "parentInbox", monthKey, "entries", msgId);
    const threadCol = collection(db, "parentInbox", monthKey, "entries", msgId, "thread");

    try {
      // mark unread for parent + update last reply time
      await updateDoc(msgRef, {
        unread: true,
        lastReplyAt: serverTimestamp()
      });

      await addDoc(threadCol, {
        from: "coach",
        fromName: "Coach",
        body: text,
        text: text,
        createdAt: serverTimestamp(),
        parentSeen: false
      });

      replyBox.value = "";
      loadThread();
    } catch (err) {
      console.error("Error sending reply:", err);
    }
  });
}

// Archive / delete ---------------------------------------

if (btnArchive) {
  btnArchive.addEventListener("click", async () => {
    if (!monthKey || !msgId) return;
    const msgRef = doc(db, "parentInbox", monthKey, "entries", msgId);
    await updateDoc(msgRef, { archived: true });
    alert("Message archived.");
    window.location.href = "/para/coach/inbox.html";
  });
}

if (btnDelete) {
  btnDelete.addEventListener("click", async () => {
    if (!monthKey || !msgId) return;
    if (!confirm("Delete this message thread?")) return;
    const msgRef = doc(db, "parentInbox", monthKey, "entries", msgId);
    await updateDoc(msgRef, { deleted: true });
    alert("Message deleted.");
    window.location.href = "/para/coach/inbox.html";
  });
}

// Init
loadThread();
