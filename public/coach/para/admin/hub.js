// ----------------------------------------------------------
// /coach/para/admin/hub.js
// Coach Hub (V1): Unread + Recent + Open-by-ID
// Reads unified parent threads: paraParentInbox
//
// V1 FIXES:
// - Do NOT filter on archived/deleted unless those fields are guaranteed to exist.
// - Show parentName cleanly; subject falls back to "Message" (not "(no subject)").
// ----------------------------------------------------------

import {
  db,
  ensureSignedIn,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const ROOT = "paraParentInbox";
const UNREAD_LIMIT = 8;
const RECENT_LIMIT = 8;

const openIdEl = document.getElementById("open-id");
const btnOpen  = document.getElementById("btn-open");

const statusEl = document.getElementById("status");
const listEl   = document.getElementById("list");

const status2El = document.getElementById("status2");
const list2El   = document.getElementById("list2");

// ------------------------------
function esc(s="") {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function safeDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : ts;
  try { return d.toLocaleString(); } catch { return ""; }
}

function threadHref(id) {
  return `/coach/para/admin/coach-thread.html?id=${encodeURIComponent(id)}`;
}

function makeCard(id, data, { unread=false } = {}) {
  const parent  = esc(data.parentName || "Parent/Guardian");
  const email   = esc(data.parentEmail || "");
  const subject = esc(data.subject || "Message");
  const body    = esc(data.lastBody || "");
  const when    = safeDate(data.lastReplyAt || data.createdAt);

  return `
    <a class="card" href="${threadHref(id)}">
      <div class="title">
        ${subject}
        ${unread ? `<span class="pill unread">UNREAD</span>` : ``}
      </div>
      <div class="sub">
        ${parent}${email ? ` • ${email}` : ""}${when ? ` • ${esc(when)}` : ""}
      </div>
      <div class="body">${body}</div>
    </a>
  `;
}

// ------------------------------
// Unread
// ------------------------------
async function loadUnread() {
  statusEl.textContent = "Loading…";
  listEl.innerHTML = "";

  const colRef = collection(db, ROOT);

  // V1: don't include archived/deleted filters unless you always write them
  const qRef = query(
    colRef,
    where("coachHasUnread", "==", true),
    orderBy("lastReplyAt", "desc"),
    limit(UNREAD_LIMIT)
  );

  const snap = await getDocs(qRef);

  if (snap.empty) {
    statusEl.textContent = "No unread threads.";
    return;
  }

  statusEl.textContent = "";
  listEl.innerHTML = snap.docs
    .map(d => makeCard(d.id, d.data() || {}, { unread:true }))
    .join("");
}

// ------------------------------
// Recent
// ------------------------------
async function loadRecent() {
  status2El.textContent = "Loading…";
  list2El.innerHTML = "";

  const colRef = collection(db, ROOT);

  const qRef = query(
    colRef,
    orderBy("lastReplyAt", "desc"),
    limit(RECENT_LIMIT)
  );

  const snap = await getDocs(qRef);

  if (snap.empty) {
    status2El.textContent = "No threads yet.";
    return;
  }

  status2El.textContent = "";
  list2El.innerHTML = snap.docs
    .map(d => makeCard(d.id, d.data() || {}, { unread:false }))
    .join("");
}

// ------------------------------
// Open by ID
// ------------------------------
btnOpen?.addEventListener("click", () => {
  const id = (openIdEl?.value || "").trim();
  if (!id) return;
  window.location.href = threadHref(id);
});

// boot
loadUnread();
loadRecent();