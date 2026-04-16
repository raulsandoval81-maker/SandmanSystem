// ----------------------------------------------------------
// /communications/coach/coach-athlete-thread.js
// Coach view of athlete thread (V1)
// Schema: paraAthleteInbox/{id} + subcollection thread
//
// Receipts:
// - on open: root.coachHasUnread=false
// - mark athlete messages seenByCoach=true (bounded sweep)
//
// Limit: 20 total messages (root counts as 1)
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

const THREAD_LIMIT = 20;

const container = document.getElementById("thread-container");
const replyBox  = document.getElementById("reply-body");
const btnSend   = document.getElementById("btn-send-reply");

const params = new URLSearchParams(location.search);
const id = (params.get("id") || "").trim();

if (!id) {
  if (container) container.innerHTML = "<p>Missing message ID.</p>";
  throw new Error("Missing id");
}

function esc(s="") {
  return String(s).replace(/[&<>'"]/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
  })[c]);
}

async function safeMergeUpdate(ref, patch) {
  try { await updateDoc(ref, patch); }
  catch { await setDoc(ref, patch, { merge: true }); }
}

function scrollBottomFast() {
  if (!container) return;
  requestAnimationFrame(() => {
    try { container.scrollTop = container.scrollHeight; } catch {}
  });
}

const rootRef   = doc(db, "paraAthleteInbox", id);
const threadCol = collection(db, "paraAthleteInbox", id, "thread");

// Load root once
const rootSnap = await getDoc(rootRef);
if (!rootSnap.exists()) {
  if (container) container.innerHTML = "<p>Thread not found.</p>";
  throw new Error("Thread not found");
}
const root = rootSnap.data() || {};

// Coach opened thread (clear unread)
safeMergeUpdate(rootRef, {
  coachOpenedAt: serverTimestamp(),
  coachHasUnread: false,
  seenByCoach: true
}).catch(() => {});

// Seen sweep: mark ATHLETE messages seenByCoach=true
let didSeenSweep = false;
async function sweepAthleteSeenByCoach() {
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
      const isAthlete = from !== "coach";
      const seen = m.seenByCoach === true;
      if (isAthlete && !seen) {
        batch.update(ds.ref, { seenByCoach: true, seenByCoachAt: serverTimestamp() });
        touched++;
      }
    });

    if (touched > 0) await batch.commit();
  } catch (e) {
    console.warn("[coach-athlete-thread] seen sweep failed:", e);
  }
}

// Live messages (bounded for speed + cap)
const qRef = query(threadCol, orderBy("createdAt", "asc"), limit(THREAD_LIMIT - 1));

let lastCount = -1;

onSnapshot(
  qRef,
  (snap) => {
    if (!container) return;

    const rows = [];

    // Root counts as 1 (initial coach note / subject body)
    rows.push(`
      <div class="thread-msg coach">
        <div style="display:flex;justify-content:space-between;gap:10px;">
          <div><strong>Coach</strong> • ${esc(root.athleteName || "(Athlete)")}</div>
          <div style="opacity:.7;font-size:.85rem;">${esc(root.createdAt?.toDate?.().toLocaleString?.() || "")}</div>
        </div>
        <div style="margin-top:8px;white-space:pre-wrap;">${esc(root.body || "")}</div>
      </div>
    `);

    snap.forEach((ds) => {
      const m = ds.data() || {};
      const from = String(m.from || "athlete").toLowerCase();
      const who = from === "coach" ? "Coach" : (m.fromName || "Athlete");
      const ts  = m.createdAt?.toDate?.().toLocaleString?.() || "";

      rows.push(`
        <div class="thread-msg ${from === "coach" ? "coach" : "parent"}">
          <div style="display:flex;justify-content:space-between;gap:10px;">
            <strong>${esc(who)}</strong>
            <span style="opacity:.7;font-size:.85rem;">${esc(ts)}</span>
          </div>
          <div style="margin-top:8px;white-space:pre-wrap;">${esc(m.body || "")}</div>
        </div>
      `);
    });

    container.innerHTML = rows.join("");

    const totalCount = 1 + snap.size;
    const grew = totalCount > lastCount;
    lastCount = totalCount;

    const locked = totalCount >= THREAD_LIMIT;
    if (replyBox) replyBox.disabled = locked;
    if (btnSend) btnSend.disabled = locked;

    if (grew) scrollBottomFast();

    setTimeout(() => { sweepAthleteSeenByCoach(); }, 250);
  },
  (err) => {
    console.error("[coach-athlete-thread] onSnapshot error:", err);
    if (container) container.innerHTML = "<p>Error loading thread.</p>";
  }
);

// Send reply
btnSend?.addEventListener("click", async () => {
  const text = (replyBox?.value || "").trim();
  if (!text) return;
  if (btnSend.disabled || replyBox?.disabled) return;

  btnSend.disabled = true;
  const old = btnSend.textContent;
  btnSend.textContent = "Sending…";

  try {
    await addDoc(threadCol, {
      from: "coach",
      fromName: "Coach",
      body: text,
      createdAt: serverTimestamp(),
      seenByAthlete: false
    });

    await safeMergeUpdate(rootRef, {
      lastReplyAt: serverTimestamp(),
      athleteHasUnread: true,
      coachHasUnread: false
    });

    if (replyBox) replyBox.value = "";
  } catch (e) {
    console.error(e);
    alert("Send failed. Check console.");
  } finally {
    btnSend.textContent = old || "Send";
    btnSend.disabled = replyBox?.disabled === true;
  }
});