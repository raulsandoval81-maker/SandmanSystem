// ----------------------------------------------------------
// /para/athlete/thread.js  (FULL FILE — READ-ONLY — V1 SAFE)
// Athlete view of Parent ↔ Coach thread (Unified Thread Model)
//
// Schema:
//   Root:   paraParentInbox/{id}
//   Thread: paraParentInbox/{id}/thread
//
// Rules:
// - Athlete is READ-ONLY (no sends, no writes, no sweeps)
// - Requires ?id= in URL
// - UI matches parent thread layout (same IDs assumed)
// ----------------------------------------------------------

import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

// ------------------------------
const ROOT_COLLECTION = "paraParentInbox";
const THREAD_LIMIT = 12;

// DOM (MATCH parent thread IDs)
const headEl  = document.getElementById("thread-head");
const msgEl   = document.getElementById("thread-messages");
const replyEl = document.getElementById("reply-body");
const btnSend = document.getElementById("btn-reply");

// ------------------------------
// helpers
// ------------------------------
function pickThreadId() {
  const p = new URLSearchParams(location.search);
  return String(p.get("id") || "").trim();
}

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function tsLabel(ts) {
  try {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : ts;
    return d?.toLocaleString?.() || "";
  } catch {
    return "";
  }
}

// ------------------------------
// READ-ONLY lock (always)
// ------------------------------
if (replyEl) {
  replyEl.disabled = true;
  replyEl.placeholder = "Read-only (athlete cannot message in V1).";
}
if (btnSend) {
  btnSend.disabled = true;
  btnSend.style.opacity = ".45";
  btnSend.style.pointerEvents = "none";
  btnSend.title = "Read-only in V1";
}

// ------------------------------
// guard: missing id
// ------------------------------
const id = pickThreadId();

if (!id) {
  if (headEl) headEl.innerHTML = `<div style="opacity:.75;">Missing <b>?id=</b> in URL.</div>`;
  if (msgEl) msgEl.innerHTML = `<div class="card" style="opacity:.75;">Open with <b>?id=</b> to view the thread.</div>`;
  console.warn("[athlete-thread] Missing id param. Use ?id=xxxx");
} else {
  // refs
  const rootRef   = doc(db, ROOT_COLLECTION, id);
  const threadCol = collection(db, ROOT_COLLECTION, id, "thread");

  // load root (one-time)
  const rootSnap = await getDoc(rootRef);
  const root = rootSnap.exists() ? (rootSnap.data() || {}) : null;

  if (!root) {
    if (headEl) headEl.innerHTML = `<div style="opacity:.75;">Thread not found.</div>`;
    if (msgEl) msgEl.innerHTML = `<div class="card" style="opacity:.75;">Thread not found.</div>`;
    console.warn("[athlete-thread] Root doc not found:", id);
  } else {
    // header (match parent look + add read-only tag)
    if (headEl) {
      headEl.innerHTML = `
        <div><strong>${esc(root.parentName || "Parent/Guardian")}</strong></div>
        <div style="opacity:.75;">Subject: ${esc(root.subject || "")}</div>
        <div style="opacity:.6;margin-top:.25rem;">Read-only • Athlete View</div>
      `;
    }

    // live messages (latest N)
    const qRef = query(threadCol, orderBy("createdAt", "desc"), limit(THREAD_LIMIT + 1));

    onSnapshot(
      qRef,
      (snap) => {
        if (!msgEl) return;

        const docsNewest = snap.docs || [];
        const overCap = docsNewest.length > THREAD_LIMIT;
        const docsToShow = docsNewest.slice(0, THREAD_LIMIT).reverse(); // oldest→newest

        if (docsToShow.length === 0) {
          msgEl.innerHTML = `
            <div class="card" style="opacity:.75;">
              No messages yet.
            </div>
          `;
          return;
        }

        const rows = docsToShow.map((ds) => {
          const m = ds.data() || {};
          const from = String(m.from || "parent").toLowerCase();

          const parentLabel =
            (m.fromName && String(m.fromName).trim()) ||
            (root.parentName && String(root.parentName).trim()) ||
            "Parent/Guardian";

          const who = from === "coach" ? "Coach" : parentLabel;
          const ts = tsLabel(m.createdAt);

          return `
            <div class="card" style="margin:.5rem 0;">
              <div style="display:flex;justify-content:space-between;gap:.75rem;">
                <strong>${esc(who)}</strong>
                <span style="opacity:.6;font-size:.85rem;">${esc(ts)}</span>
              </div>
              <div style="white-space:pre-wrap;margin-top:.25rem;">${esc(m.body || "")}</div>
            </div>
          `;
        });

        msgEl.innerHTML = rows.join("");

        if (overCap) {
          msgEl.insertAdjacentHTML(
            "afterbegin",
            `<div class="card" style="opacity:.65;margin:.5rem 0;">
               Showing latest ${THREAD_LIMIT} messages.
             </div>`
          );
        }
      },
      (err) => {
        console.error("[athlete-thread] onSnapshot error:", err);
        if (msgEl) msgEl.innerHTML = `<div class="card" style="opacity:.75;">Error loading thread.</div>`;
      }
    );
  }
}