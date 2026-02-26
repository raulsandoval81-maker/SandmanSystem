// ----------------------------------------------------------
// /coach/para/athlete/inbox.js
// Athlete Inbox (V1)
// Schema: paraAthleteInbox/{id}
// Unread = coachHasUnread === true
// ----------------------------------------------------------

import {
  db,
  ensureSignedIn,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit
} from "/assets/js/firebase-init-para.js";

ensureSignedIn().catch(() => {});

/* -----------------------
   CONFIG (V1)
------------------------ */
const TEAM_ID = "law";

// Choose ONE identity key.
// ✅ Default: athleteUid (recommended)
const IDENTITY_KEY = "athleteUid"; // "athleteUid" | "mintVirtueTag"

// Provide the athlete identity value.
// Option A: pass via URL: inbox.html?athleteUid=F4_0001
// Option B: localStorage: localStorage.setItem("athleteUid","F4_0001")
function getIdentityValue() {
  const params = new URLSearchParams(location.search);
  const v1 = (params.get(IDENTITY_KEY) || "").trim();
  if (v1) return v1;

  const v2 = (localStorage.getItem(IDENTITY_KEY) || "").trim();
  if (v2) return v2;

  return ""; // force visible error
}

/* -----------------------
   DOM
------------------------ */
const listEl   = document.getElementById("inbox-list");
const emptyEl  = document.getElementById("inbox-empty");
const searchEl = document.getElementById("inbox-search");

/* -----------------------
   Helpers
------------------------ */
function esc(s="") {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
function safeDate(ts){
  try { return ts?.toDate?.().toLocaleString?.() || ""; } catch { return ""; }
}
function normalize(s){ return String(s||"").toLowerCase().trim(); }
function matchSearch(d, q){
  if (!q) return true;
  const hay = [
    d?.subject, d?.title,
    d?.coachName,
    d?.body
  ].map(normalize).join(" | ");
  return hay.includes(q);
}
function paintEmpty(on){
  if (emptyEl) emptyEl.style.display = on ? "block" : "none";
}

function buildRow(id, d) {
  const unread = d?.coachHasUnread === true;
  const subject = d?.subject || d?.title || "(no subject)";
  const preview = d?.body || "(no message)";
  const when = safeDate(d?.lastReplyAt || d?.createdAt);

  const pill = unread
    ? `<span class="pill pill-unread">UNREAD</span>`
    : `<span class="pill pill-read">READ</span>`;

  const href = `/coach/para/athlete/thread.html?id=${encodeURIComponent(id)}`;

  return `
    <a class="inbox-item ${unread ? "unread" : "read"}" href="${href}">
      <div class="inbox-head">
        <div class="inbox-subject" style="color:${unread ? "var(--gold)" : "var(--text)"};">
          ${esc(subject)}
        </div>
        ${pill}
      </div>
      <div class="inbox-meta">
        ${when ? `<span>${esc(when)}</span>` : ""}
        <span style="float:right;">Team: ${esc(d?.teamId || TEAM_ID)}</span>
      </div>
      <div style="margin-top:8px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${esc(preview)}
      </div>
    </a>
  `;
}

/* -----------------------
   State + Render
------------------------ */
let allRows = [];

function render() {
  if (!listEl) return;

  const q = normalize(searchEl?.value || "");

  const visible = allRows
    .filter((x) => x?.teamId === TEAM_ID)
    .filter((x) => x?.archived !== true && x?.deleted !== true)
    .filter((x) => matchSearch(x, q));

  if (!visible.length) {
    listEl.innerHTML = "";
    paintEmpty(true);
    return;
  }

  paintEmpty(false);
  listEl.innerHTML = visible.map((d) => buildRow(d._id, d)).join("");
}

/* -----------------------
   Live load
------------------------ */
const identityVal = getIdentityValue();

if (!identityVal) {
  if (listEl) {
    listEl.innerHTML = `
      <div class="card" style="padding:12px 14px;">
        Missing identity. Provide <b>?${IDENTITY_KEY}=...</b> or set localStorage <b>${IDENTITY_KEY}</b>.
      </div>
    `;
  }
} else {
  // Note: We keep query index-free by pulling recent docs then filtering client-side.
  const qRef = query(
    collection(db, "paraAthleteInbox"),
    orderBy("createdAt", "desc"),
    limit(250)
  );

  onSnapshot(
    qRef,
    (snap) => {
      const rows = [];
      snap.forEach((ds) => {
        const d = ds.data() || {};
        // identity filter
        if (String(d?.[IDENTITY_KEY] || "").trim() !== identityVal) return;

        rows.push({ ...d, _id: ds.id });
      });

      // sort by lastReplyAt/createdAt desc
      rows.sort((a,b) => {
        const am = (a.lastReplyAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0);
        const bm = (b.lastReplyAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0);
        return bm - am;
      });

      allRows = rows;
      render();
    },
    (err) => {
      console.error("[athlete-inbox] onSnapshot error:", err);
      if (listEl) listEl.innerHTML = `<div class="card">Error loading inbox.</div>`;
      paintEmpty(false);
    }
  );
}

/* -----------------------
   UI events
------------------------ */
searchEl?.addEventListener("input", () => render());