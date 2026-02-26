// ----------------------------------------------------------
// /coach/para/admin/coach-thread.js  (V1 — UNIFIED + SHIPPABLE)
// Coach view of ONE parent thread + Quick Reply dropdown
//
// Schema:
//   Root:   paraParentInbox/{id}
//   Msgs:   paraParentInbox/{id}/thread
//
// V1:
// - Unified collection: paraParentInbox
// - Coach open clears: coachHasUnread
// - Coach reply sets: parentHasUnread=true
// - Seen sweep (debounced): mark parent msgs seenByCoach=true
// - UI cap: 12 messages visible window; locks reply at/over cap
// ----------------------------------------------------------

import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  limit
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

// -------------------- CONFIG --------------------
const ROOT_COLLECTION = "paraParentInbox";
const THREAD_LIMIT = 12;

const LIMIT_BANNER_MSG =
  "This conversation has reached its text limit (12). Please schedule a call or meet in person.";

// DOM
const container    = document.getElementById("thread-container");
const replyBox     = document.getElementById("reply-body");
const btnSendReply = document.getElementById("btn-send-reply");
const btnArchive   = document.getElementById("btn-archive");
const btnDelete    = document.getElementById("btn-delete");

// Quick reply dropdown
const qrSelect = document.getElementById("qr-select");
const qrInsert = document.getElementById("qr-insert");

// URL params
const params = new URLSearchParams(window.location.search);
const threadId = (params.get("id") || "").trim();

// ---------- helpers ----------
function safeDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : ts;
  try { return d.toLocaleString(); } catch { return ""; }
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
  const isCoach = String(msg.from || "").toLowerCase() === "coach";
  const avatarHTML = makeAvatar(msg.fromName || (isCoach ? "Coach" : "Parent/Guardian"), isCoach);

  let statusHTML = "";
  if (isCoach) {
    const seen = msg.seenByParent === true;
    statusHTML = seen
      ? `<div style="color:#4ade80;font-size:.7rem;margin-top:4px;">Seen</div>`
      : `<div style="color:#64748b;font-size:.7rem;margin-top:4px;">Delivered</div>`;
  }

  return `
    <div class="thread-msg ${isCoach ? "coach" : "parent"}">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        ${avatarHTML}
        <div>
          <div class="from">${escapeHTML(msg.fromName || (isCoach ? "Coach" : "Parent/Guardian"))}</div>
          <div class="timestamp">${safeDate(msg.createdAt)}</div>
          <div class="body">${escapeHTML(msg.body || "")}</div>
          ${statusHTML}
        </div>
      </div>
    </div>
  `;
}

function scrollToBottomFast() {
  if (!container) return;
  requestAnimationFrame(() => {
    try { container.scrollTop = container.scrollHeight; } catch {}
  });
}

async function safeMergeUpdate(ref, data) {
  try {
    await updateDoc(ref, data);
  } catch {
    await setDoc(ref, data, { merge: true });
  }
}

// UI lock + banner
function enforceThreadLimit(windowCount, hasMoreThanLimit) {
  const limitReached = windowCount >= THREAD_LIMIT || hasMoreThanLimit;

  if (replyBox) replyBox.disabled = limitReached;
  if (btnSendReply) btnSendReply.disabled = limitReached;
  if (qrSelect) qrSelect.disabled = limitReached;
  if (qrInsert) qrInsert.disabled = limitReached;

  const existingBanner = document.getElementById("thread-limit-banner");
  if (limitReached && !existingBanner && container) {
    const banner = document.createElement("div");
    banner.id = "thread-limit-banner";
    banner.style.cssText = `
      background:#1e293b;
      color:#ffdd48;
      padding:12px;
      margin:12px 0;
      border:1px solid #334155;
      font-weight:800;
      text-align:center;
      border-radius:8px;
    `;
    banner.textContent = LIMIT_BANNER_MSG;
    container.prepend(banner);
  }
}

// receipts sweep (debounced)
let sweepTimer = null;
function scheduleCoachSeenSweep(qs) {
  if (sweepTimer) clearTimeout(sweepTimer);

  sweepTimer = setTimeout(async () => {
    try {
      const jobs = [];
      qs.forEach((ds) => {
        const m = ds.data() || {};
        const from = String(m.from || "").toLowerCase();
        const isParentMsg = from === "parent";
        if (isParentMsg && m.seenByCoach !== true) {
          jobs.push(updateDoc(ds.ref, { seenByCoach: true, seenByCoachAt: serverTimestamp() }));
        }
      });
      if (jobs.length) await Promise.allSettled(jobs);
    } catch (e) {
      console.warn("[coach-thread] seenByCoach sweep failed:", e);
    }
  }, 250);
}

// quick replies: dropdown → insert into replyBox
function bindQuickReplies() {
  if (!qrSelect || !qrInsert || !replyBox) return;

  qrInsert.addEventListener("click", () => {
    const text = String(qrSelect.value || "").trim();
    if (!text) return;

    replyBox.value = replyBox.value
      ? (replyBox.value.trimEnd() + "\n\n" + text)
      : text;

    replyBox.focus();
    qrSelect.value = "";
  });
}

bindQuickReplies();

// -------------------- main load --------------------
let unsub = null;
let root = null;

let currentWindowCount = 0;
let currentHasMoreThanLimit = false;

async function loadThread() {
  if (!container) return;

  if (!threadId) {
    container.innerHTML = "<p>Missing thread ID (?id=).</p>";
    return;
  }

  const rootRef = doc(db, ROOT_COLLECTION, threadId);
  const snap = await getDoc(rootRef);

  if (!snap.exists()) {
    container.innerHTML = "<p>Thread not found.</p>";
    return;
  }

  root = snap.data() || {};
  const parentName = root.parentName || root.name || "Parent/Guardian";

  // coach opened: clear coach unread now
  safeMergeUpdate(rootRef, {
    coachOpenedAt: serverTimestamp(),
    coachHasUnread: false,
    seenByCoach: true
  }).catch(() => {});

  const threadCol = collection(db, ROOT_COLLECTION, threadId, "thread");

  // newest-first + N+1 so you never get stuck on oldest 12
  const qRef = query(threadCol, orderBy("createdAt", "desc"), limit(THREAD_LIMIT + 1));

  if (unsub) { try { unsub(); } catch {} unsub = null; }

  unsub = onSnapshot(
    qRef,
    (qs) => {
      const docsNewest = qs.docs || [];
      const hasMoreThanLimit = docsNewest.length > THREAD_LIMIT;
      const docsToShow = docsNewest.slice(0, THREAD_LIMIT).reverse();

      currentWindowCount = Math.min(docsNewest.length, THREAD_LIMIT);
      currentHasMoreThanLimit = hasMoreThanLimit;

      container.innerHTML = "";

      if (hasMoreThanLimit) {
        container.insertAdjacentHTML(
          "beforeend",
          `<div class="thread-msg" style="opacity:.75;">
             <div style="background:#0b1220;border:1px solid #27304a;border-radius:10px;padding:10px;">
               Showing latest ${THREAD_LIMIT} messages.
             </div>
           </div>`
        );
      }

      docsToShow.forEach((d) => {
        const t = d.data() || {};
        const fromLower = String(t.from || "parent").toLowerCase();
        container.insertAdjacentHTML("beforeend", buildThreadMessage({
          from: fromLower,
          fromName: t.fromName || (fromLower === "coach" ? "Coach" : parentName),
          body: t.body || "",
          createdAt: t.createdAt,
          seenByParent: t.seenByParent === true,
          seenByCoach: t.seenByCoach === true
        }));
      });

      enforceThreadLimit(currentWindowCount, hasMoreThanLimit);

      if (qs.size > 0) scheduleCoachSeenSweep(qs);

      scrollToBottomFast();
    },
    (err) => {
      console.error("[coach-thread] onSnapshot error:", err);
      container.innerHTML = "<p>Error loading thread.</p>";
    }
  );
}

// -------------------- send reply --------------------
if (btnSendReply && replyBox) {
  btnSendReply.addEventListener("click", async () => {
    const text = replyBox.value.trim();
    if (!text || !threadId) return;

    if (currentWindowCount >= THREAD_LIMIT || currentHasMoreThanLimit) {
      enforceThreadLimit(currentWindowCount, currentHasMoreThanLimit);
      return;
    }

    if (replyBox.disabled || btnSendReply.disabled) return;

    const rootRef = doc(db, ROOT_COLLECTION, threadId);
    const threadCol = collection(db, ROOT_COLLECTION, threadId, "thread");

    btnSendReply.disabled = true;
    const old = btnSendReply.textContent;
    btnSendReply.textContent = "Sending…";

    try {
      await addDoc(threadCol, {
        from: "coach",
        fromName: "Coach",
        body: text,
        createdAt: serverTimestamp(),
        seenByParent: false,
        seenByCoach: true,
        system: false
      });

      await safeMergeUpdate(rootRef, {
        lastBody: text,
        lastReplyAt: serverTimestamp(),
        parentHasUnread: true,
        coachHasUnread: false,
        seenByCoach: true
      });

      replyBox.value = "";
      replyBox.focus();
    } catch (err) {
      console.error("[coach-thread] send reply error:", err);
      alert("Send failed. Check console.");
    } finally {
      btnSendReply.textContent = old || "Send";
      btnSendReply.disabled = replyBox?.disabled === true;
    }
  });
}

// -------------------- archive / delete (root flags) --------------------
if (btnArchive) {
  btnArchive.addEventListener("click", async () => {
    if (!threadId) return;
    try {
      await safeMergeUpdate(doc(db, ROOT_COLLECTION, threadId), {
        archived: true,
        archivedAt: serverTimestamp()
      });
      alert("Thread archived.");
      window.location.href = "/coach/para/admin/hub.html";
    } catch (e) {
      console.error("[coach-thread] archive error:", e);
    }
  });
}

if (btnDelete) {
  btnDelete.addEventListener("click", async () => {
    if (!threadId) return;
    if (!confirm("Delete this thread?")) return;
    try {
      await safeMergeUpdate(doc(db, ROOT_COLLECTION, threadId), {
        deleted: true,
        deletedAt: serverTimestamp()
      });
      alert("Thread deleted.");
      window.location.href = "/coach/para/admin/hub.html";
    } catch (e) {
      console.error("[coach-thread] delete error:", e);
    }
  });
}

// cleanup
window.addEventListener("beforeunload", () => {
  if (unsub) { try { unsub(); } catch {} unsub = null; }
  if (sweepTimer) { try { clearTimeout(sweepTimer); } catch {} sweepTimer = null; }
});

// init
loadThread();