// ----------------------------------------------------------
// /coach/para/parent/thread.js  (FULL FILE — CLEANED — V1 SAFE)
// Parent ↔ Coach thread (Unified Thread Model)
//
// Schema:
//   Root:   paraParentInbox/{id}
//   Thread: paraParentInbox/{id}/thread
//
// Notes:
// - Root is METADATA (subject, lastBody, flags). Messages live in /thread.
// - On open: root.parentHasUnread=false, seenByParent=true, parentOpenedAt=now
// - Seen sweep: mark coach messages seenByParent=true (bounded)
// - Limit: 12 messages total in subcollection (UI cap). Real enforcement should be server/rules.
//
// VISUAL:
// - Renders bubbles using: .thread-msg .parent/.coach (matches comms.css bubble rules)
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
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  writeBatch,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

// ------------------------------
const ROOT_COLLECTION = "paraParentInbox";
const THREAD_LIMIT = 12;

// DOM (match your page IDs)
const headEl  = document.getElementById("thread-head");
const msgEl   = document.getElementById("thread-messages");
const replyEl = document.getElementById("reply-body");
const btnSend = document.getElementById("btn-reply");

// ------------------------------
// param helper (accepts id/msgId/threadId)
// ------------------------------
function pickThreadId() {
  const p = new URLSearchParams(location.search);
  return (
    String(p.get("id") || "").trim() ||
    String(p.get("msgId") || "").trim() ||
    String(p.get("threadId") || "").trim()
  );
}

const id = pickThreadId();

// ------------------------------
// utils
// ------------------------------
function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function disableReply() {
  if (replyEl) replyEl.disabled = true;
  if (btnSend) btnSend.disabled = true;
}

function scrollBottomFast() {
  if (!msgEl) return;
  requestAnimationFrame(() => {
    try { msgEl.scrollTop = msgEl.scrollHeight; } catch {}
  });
}

async function safeMergeUpdate(ref, patch) {
  try {
    await updateDoc(ref, patch);
  } catch {
    await setDoc(ref, patch, { merge: true });
  }
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
// guard: missing id
// ------------------------------
if (!id) {
  if (headEl) headEl.innerHTML = `<div style="opacity:.75;">Missing <b>?id=</b> in URL.</div>`;
  if (msgEl) msgEl.innerHTML = `<div class="card" style="opacity:.75;">Open this page from Compose so it includes an id.</div>`;
  disableReply();
  console.warn("[parent-thread] Missing id param. Use ?id=xxxx");
} else {
  // ------------------------------
  // refs
  // ------------------------------
  const rootRef   = doc(db, ROOT_COLLECTION, id);
  const threadCol = collection(db, ROOT_COLLECTION, id, "thread");

  // ------------------------------
  // load root
  // ------------------------------
  const rootSnap = await getDoc(rootRef);
  const root = rootSnap.exists() ? (rootSnap.data() || {}) : null;

  if (!root) {
    if (headEl) headEl.innerHTML = `<div style="opacity:.75;">Thread not found.</div>`;
    if (msgEl) msgEl.innerHTML = `<div class="card" style="opacity:.75;">Thread not found.</div>`;
    disableReply();
    console.warn("[parent-thread] Root doc not found:", id);
  } else {
    // header
    if (headEl) {
      headEl.innerHTML = `
        <div><strong>${esc(root.parentName || "Parent/Guardian")}</strong></div>
        <div style="opacity:.75;">Subject: ${esc(root.subject || "")}</div>
      `;
    }

    // mark opened (don’t block UI)
    safeMergeUpdate(rootRef, {
      parentOpenedAt: serverTimestamp(),
      seenByParent: true,
      parentHasUnread: false
    }).catch(() => {});

    // seen sweep: mark COACH messages seenByParent=true (bounded)
    let didSeenSweep = false;
    async function sweepCoachSeenByParent() {
      if (didSeenSweep) return;
      didSeenSweep = true;

      try {
        const qs = await getDocs(query(threadCol, orderBy("createdAt", "desc"), limit(80)));
        if (qs.empty) return;

        const batch = writeBatch(db);
        let touched = 0;

        qs.forEach((ds) => {
          const m = ds.data() || {};
          const from = String(m.from || "").toLowerCase();
          const isCoach = from === "coach";
          const seen = m.seenByParent === true;

          if (isCoach && !seen) {
            batch.update(ds.ref, {
              seenByParent: true,
              seenByParentAt: serverTimestamp()
            });
            touched++;
          }
        });

        if (touched > 0) await batch.commit();
      } catch (e) {
        console.warn("[parent-thread] seen sweep failed:", e);
      }
    }

    // ------------------------------------------------
    // Live messages:
    // - Read newest-first, limit N+1 to detect "over cap"
    // - Render oldest→newest by reversing for display
    // ------------------------------------------------
    const qRef = query(
      threadCol,
      orderBy("createdAt", "desc"),
      limit(THREAD_LIMIT + 1)
    );

    let lastRenderCount = -1;

    onSnapshot(
      qRef,
      (snap) => {
        if (!msgEl) return;

        const docsNewest = snap.docs || [];
        const overCap = docsNewest.length > THREAD_LIMIT;
        const docsToShow = docsNewest.slice(0, THREAD_LIMIT).reverse();

        if (docsToShow.length === 0) {
          msgEl.innerHTML = `
            <div class="card" style="opacity:.75;">
              No messages yet. Send one below.
            </div>
          `;
        } else {
          const rows = docsToShow.map((ds) => {
            const m = ds.data() || {};
            const from = String(m.from || "parent").toLowerCase();

            const parentLabel =
              (m.fromName && String(m.fromName).trim()) ||
              (root?.parentName && String(root.parentName).trim()) ||
              "Parent/Guardian";

            const who = from === "coach" ? "Coach" : parentLabel;
            const ts = tsLabel(m.createdAt);
            const isCoach = from === "coach";

            return `
              <div class="thread-msg ${isCoach ? "coach" : "parent"}">
                <div class="from">${esc(who)}</div>
                <div class="timestamp">${esc(ts)}</div>
                <div class="body">${esc(m.body || "")}</div>
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
        }

        // UI lock: lock when we see >= limit in this window
        const totalInWindow = docsNewest.length;
        const locked = totalInWindow >= THREAD_LIMIT;

        if (replyEl) replyEl.disabled = locked;
        if (btnSend) btnSend.disabled = locked;

        const grew = totalInWindow > lastRenderCount;
        lastRenderCount = totalInWindow;

        if (grew) scrollBottomFast();

        setTimeout(() => { sweepCoachSeenByParent(); }, 250);
      },
      (err) => {
        console.error("[parent-thread] onSnapshot error:", err);
        if (msgEl) msgEl.innerHTML = `<div class="card" style="opacity:.75;">Error loading thread.</div>`;
        disableReply();
      }
    );

    // send
    btnSend?.addEventListener("click", async () => {
      const body = (replyEl?.value || "").trim();
      if (!body) return;
      if (btnSend.disabled || replyEl?.disabled) return;

      btnSend.disabled = true;
      const old = btnSend.textContent || "Send";
      btnSend.textContent = "Sending…";

      try {
        await addDoc(threadCol, {
          from: "parent",
          fromName: root?.parentName || "Parent/Guardian",
          body,
          createdAt: serverTimestamp(),
          seenByCoach: false,
          seenByParent: true
        });

        await safeMergeUpdate(rootRef, {
          lastBody: body,
          lastReplyAt: serverTimestamp(),
          coachHasUnread: true,
          parentHasUnread: false,
          seenByParent: true,
          seenByCoach: false
        });

        if (replyEl) replyEl.value = "";
      } catch (e) {
        console.error("[parent-thread] send failed:", e);
        alert("Send failed. Check console.");
      } finally {
        btnSend.textContent = old;
        btnSend.disabled = replyEl?.disabled === true;
      }
    });
  }
}