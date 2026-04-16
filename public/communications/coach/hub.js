// ----------------------------------------------------------
// /communications/coach/hub.js
// Coach Hub (V1): Unread + Recent + Open-by-ID
// Reads unified parent threads: paraParentInbox
//
// FIXES:
// - Uses correct browser path for coach thread page
// - Adds error handling for unread/recent loaders
// - Shows parentName cleanly; subject falls back to "Message"
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
const btnOpen = document.getElementById("btn-open");

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

const status2El = document.getElementById("status2");
const list2El = document.getElementById("list2");

// ------------------------------
function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : ts;
  try {
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function threadHref(id) {
  return `/communications/coach/coach-thread.html?id=${encodeURIComponent(id)}`;
}

function makeCard(id, data, { unread = false } = {}) {
  const parent = esc(data.parentName || "Parent/Guardian");
  const email = esc(data.parentEmail || "");
  const subject = esc(data.subject || "Message");
  const body = esc(data.lastBody || "");
  const when = safeDate(data.lastReplyAt || data.createdAt);

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

  try {
    const colRef = collection(db, ROOT);

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
      .map(d => makeCard(d.id, d.data() || {}, { unread: true }))
      .join("");
  } catch (err) {
    console.error("[coach-hub] unread load failed:", err);
    statusEl.textContent = "Failed to load unread threads.";
    listEl.innerHTML = "";
  }
}

// ------------------------------
// Recent
// ------------------------------
async function loadRecent() {
  status2El.textContent = "Loading…";
  list2El.innerHTML = "";

  try {
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
      .map(d => makeCard(d.id, d.data() || {}, { unread: false }))
      .join("");
  } catch (err) {
    console.error("[coach-hub] recent load failed:", err);
    status2El.textContent = "Failed to load recent threads.";
    list2El.innerHTML = "";
  }
}

// ------------------------------
// Open by ID
// ------------------------------
btnOpen?.addEventListener("click", () => {
  const id = (openIdEl?.value || "").trim();
  if (!id) return;
  window.location.href = threadHref(id);
});

openIdEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnOpen?.click();
  }
});

// ------------------------------
// Boot
// ------------------------------
loadUnread();
loadRecent();