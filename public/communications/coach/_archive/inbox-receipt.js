// ----------------------------------------------------------
// /communications/coach/inbox.js
// Coach/Admin Para-Comms Inbox (V1)
// Schema: paraCoachInbox/{id}
// - Hide archived/deleted
// - Unread = seen !== true
// - Live updates via onSnapshot
// - Search + Month filter (client-side, index-free)
// ----------------------------------------------------------

import {
  db,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit
} from "/assets/js/firebase-init-para.js";

/* -----------------------
   DOM (matches your HTML)
------------------------ */
const listEl   = document.getElementById("inbox-list");
const emptyEl  = document.getElementById("inbox-empty");
const searchEl = document.getElementById("inbox-search");
const monthEl  = document.getElementById("inbox-month");

/* -----------------------
   Guards
------------------------ */
if (!listEl) console.warn("[para-admin-inbox] Missing #inbox-list");
if (!monthEl) console.warn("[para-admin-inbox] Missing #inbox-month");

/* -----------------------
   Helpers
------------------------ */
function escapeHTML(str = "") {
  return String(str).replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[c]);
}

function toMillis(ts) {
  if (!ts) return 0;
  try {
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
  } catch {}
  return 0;
}

function safeDate(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : ts;
    return d?.toLocaleString?.() || "";
  } catch {
    return "";
  }
}

function isHidden(d) {
  return d?.archived === true || d?.deleted === true;
}

function isUnread(d) {
  return d?.seen !== true;
}

function getSortStamp(d) {
  return d?.lastReplyAt || d?.createdAt || null;
}

function monthKeyFromTs(ts) {
  const ms = toMillis(ts);
  if (!ms) return "unknown";
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

function matchSearch(d, q) {
  if (!q) return true;
  const hay = [
    d?.subject,
    d?.name,
    d?.email,
    d?.body,
    d?.athleteUid,
    d?.familyId,
    d?.teamId,
    d?.teamName
  ].map(normalize).join(" | ");
  return hay.includes(q);
}

function buildRow(id, d) {
  const unread = isUnread(d);

  const subject = d?.subject || "(no subject)";
  const name    = d?.name || d?.parentName || "Parent";
  const preview = d?.body || "(no message)";
  const when    = safeDate(getSortStamp(d));

  const team = d?.teamName || d?.teamId || "";
  const athlete = d?.athleteUid ? ` • ${d.athleteUid}` : "";
  const pill = unread
    ? `<span class="inbox-pill pill-unread">UNREAD</span>`
    : `<span class="inbox-pill pill-read">READ</span>`;

  const href = `/communications/coach/coach-thread.html?id=${encodeURIComponent(id)}`;

  return `
    <a href="${href}" class="inbox-item ${unread ? "unread" : "read"}" style="text-decoration:none;color:inherit;">
      <div class="inbox-head">
        <div class="inbox-subject" style="color:${unread ? "var(--gold)" : "var(--text)"};">
          ${escapeHTML(subject)}
        </div>
        ${pill}
      </div>

      <div class="inbox-meta">
        <strong>${escapeHTML(name)}</strong>
        ${team ? `<span> • ${escapeHTML(team)}</span>` : ""}
        ${athlete ? `<span>${escapeHTML(athlete)}</span>` : ""}
        ${when ? `<span style="float:right;">${escapeHTML(when)}</span>` : ""}
      </div>

      <div style="margin-top:8px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${escapeHTML(preview)}
      </div>
    </a>
  `;
}

function paintEmpty(on) {
  if (emptyEl) emptyEl.style.display = on ? "block" : "none";
}

function fillMonthDropdown(keys) {
  if (!monthEl) return;

  const current = monthEl.value || "";

  // Build options
  const opts = ["all", ...keys];
  monthEl.innerHTML = "";

  opts.forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = (k === "all") ? "All" : k;
    monthEl.appendChild(opt);
  });

  // preserve selection if possible
  if (opts.includes(current)) monthEl.value = current;
  else monthEl.value = "all";
}

/* -----------------------
   State
------------------------ */
let unsub = null;
let allRows = [];      // raw, normalized records
let monthKeys = [];    // available months (newest first)

/* -----------------------
   Render with filters
------------------------ */
function render() {
  if (!listEl) return;

  const q = normalize(searchEl?.value || "");
  const selectedMonth = monthEl?.value || "all";

  const visible = allRows
    .filter((x) => !isHidden(x.data))
    .filter((x) => selectedMonth === "all" ? true : x.monthKey === selectedMonth)
    .filter((x) => matchSearch(x.data, q));

  if (visible.length === 0) {
    listEl.innerHTML = "";
    paintEmpty(true);
    return;
  }

  paintEmpty(false);
  listEl.innerHTML = visible.map((x) => buildRow(x.id, x.data)).join("");
}

/* -----------------------
   Live load
------------------------ */
function start() {
  // newest first from Firestore, then we re-sort using lastReplyAt/createdAt
  const qRef = query(
    collection(db, "paraCoachInbox"),
    orderBy("createdAt", "desc"),
    limit(250)
  );

  // prevent duplicate listeners
  if (unsub) { try { unsub(); } catch {} unsub = null; }

  unsub = onSnapshot(
    qRef,
    (snap) => {
      const rows = [];
      const keySet = new Set();

      snap.forEach((ds) => {
        const d = ds.data() || {};
        const mk = monthKeyFromTs(d.createdAt);
        keySet.add(mk);

        rows.push({
          id: ds.id,
          data: d,
          monthKey: mk,
          sortMs: Math.max(toMillis(d.lastReplyAt), toMillis(d.createdAt))
        });
      });

      // newest month first
      monthKeys = Array.from(keySet)
        .filter((k) => k !== "unknown")
        .sort((a, b) => b.localeCompare(a));

      fillMonthDropdown(monthKeys);

      // sort active threads by lastReplyAt/createdAt (desc)
      rows.sort((a, b) => (b.sortMs - a.sortMs));

      allRows = rows;
      render();
    },
    (err) => {
      console.error("[para-admin-inbox] onSnapshot error:", err);
      if (listEl) listEl.innerHTML = `<p style="opacity:.8;">Error loading inbox.</p>`;
      paintEmpty(false);
    }
  );
}

/* -----------------------
   UI events
------------------------ */
searchEl?.addEventListener("input", () => render());
monthEl?.addEventListener("change", () => render());

/* -----------------------
   Cleanup
------------------------ */
window.addEventListener("beforeunload", () => {
  if (unsub) { try { unsub(); } catch {} unsub = null; }
});

/* -----------------------
   Init
------------------------ */
start();