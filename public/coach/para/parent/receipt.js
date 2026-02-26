// ------------------------------------------------------------
// Parent Message Thread — Receipt View (Pilot Mode) — V1
// Schema: paraCoachInbox/{id} + subcollection thread
// - Parent open clears parentHasUnread on root
// - Parent open marks coach replies parentSeen=true
// - Thread hard limit: 20 total messages (root + 19 replies)
// ------------------------------------------------------------

import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  onSnapshot
} from "/assets/js/firebase-init-para.js";

// ------------------------------------------------------------
// URL PARAMS
// ------------------------------------------------------------
const params = new URLSearchParams(location.search);
const id = (params.get("id") || "").trim();

// Optional dev toggle: ?as=coach to simulate coach sending
const testCoach = params.get("as") === "coach";

// ------------------------------------------------------------
// LIMIT RULES
// ------------------------------------------------------------
const THREAD_LIMIT_TOTAL = 20;          // root counts as 1
const THREAD_LIMIT_REPLIES = 19;        // replies allowed in subcollection
const LIMIT_MSG =
  "This conversation has reached its text limit. Please schedule a call or meet in person.";

// ------------------------------------------------------------
// DOM
// ------------------------------------------------------------
const threadEl   = document.querySelector("#thread");
const replyInput = document.querySelector("#reply-text");
const replyBtn   = document.querySelector("#reply-send");
const successMsg = document.querySelector("#reply-success");

if (!id) {
  if (threadEl) threadEl.innerHTML = "<p>Missing message ID.</p>";
  throw new Error("No ID found.");
}
if (!threadEl) {
  throw new Error("Missing #thread element in HTML.");
}

// ------------------------------------------------------------
// UI helpers (limit)
// ------------------------------------------------------------
function ensureLimitBanner() {
  const existing = document.getElementById("thread-limit-banner");
  if (existing) return;

  const banner = document.createElement("div");
  banner.id = "thread-limit-banner";
  banner.style.cssText = `
    background:#1e293b;
    color:#ffdd48;
    padding:12px;
    margin:12px 0;
    border:1px solid #334155;
    font-weight:700;
    text-align:center;
    border-radius:10px;
  `;
  banner.textContent = LIMIT_MSG;
  threadEl.prepend(banner);
}

function enforceLimitUI(totalCount) {
  const reached = totalCount >= THREAD_LIMIT_TOTAL;

  if (replyInput) replyInput.disabled = reached;
  if (replyBtn) replyBtn.disabled = reached;

  if (reached) ensureLimitBanner();
  return reached;
}

// ------------------------------------------------------------
// GROUPING STATE
// ------------------------------------------------------------
let lastSender = null;
let lastTimestamp = 0;
const GROUP_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

// ------------------------------------------------------------
// RENDERER (Grouped Messages)
// ------------------------------------------------------------
function appendMessage({ from, fromName, text, ts }) {
  const isCoach = (from === "coach");
  const sender = isCoach ? (fromName || "Coach") : (fromName || "Parent/Guardian");

  const dt = ts instanceof Date ? ts : (ts?.toDate?.() || new Date());
  const timeVal = dt.getTime();

  const sameSender = (sender === lastSender);
  const closeInTime = (timeVal - lastTimestamp <= GROUP_WINDOW_MS);

  let groupEl;

  // REUSE LAST GROUP?
  if (sameSender && closeInTime) {
    const groups = threadEl.querySelectorAll(".msg-group");
    groupEl = groups[groups.length - 1];
  } else {
    groupEl = document.createElement("div");
    groupEl.className = `msg-group ${isCoach ? "coach" : "parent"}`;

    const fromLabel = document.createElement("div");
    fromLabel.className = "group-from";
    fromLabel.textContent = sender;

    groupEl.appendChild(fromLabel);
    threadEl.appendChild(groupEl);
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text || "";

  const stamp = document.createElement("div");
  stamp.className = "msg-stamp";
  stamp.textContent = dt ? dt.toLocaleString() : "";

  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap";
  wrap.appendChild(bubble);
  wrap.appendChild(stamp);

  groupEl.appendChild(wrap);

  lastSender = sender;
  lastTimestamp = timeVal;
}

// ------------------------------------------------------------
// READ RECEIPTS (Parent-side)
// - root.parentHasUnread -> false
// - all coach replies parentSeen -> true
// ------------------------------------------------------------
let receiptsApplied = false;

async function applyParentReceipts({ msgRef, threadCol }) {
  if (receiptsApplied) return;
  receiptsApplied = true;

  // 1) Root: parent has opened, clear unread
  try {
    await updateDoc(msgRef, {
      parentHasUnread: false,
      parentOpenedAt: serverTimestamp()
    });
  } catch (e) {
    console.warn("[parent-thread] root receipt update failed:", e);
  }

  // 2) Mark coach replies as seen by parent (bounded)
  try {
    const unseenCoachQ = query(
      threadCol,
      where("from", "==", "coach"),
      where("parentSeen", "==", false),
      orderBy("createdAt", "asc"),
      limit(50) // enough for V1; thread is capped anyway
    );

    const snap = await getDocs(unseenCoachQ);

    // Update each doc (simple + safe in V1)
    for (const ds of snap.docs) {
      try {
        await updateDoc(ds.ref, { parentSeen: true });
      } catch (e) {
        console.warn("[parent-thread] could not set parentSeen:", e);
      }
    }
  } catch (e) {
    // If you ever hit an index warning, we can simplify the query.
    console.warn("[parent-thread] coach parentSeen sweep failed:", e);
  }
}

// ------------------------------------------------------------
// LOAD ORIGINAL + LISTEN LIVE
// ------------------------------------------------------------
let unsub = null;

async function loadThread() {
  // Auth helps with rules (even if read-only)
  try { await ensureSignedIn(); } catch {}

  const msgRef = doc(db, "paraCoachInbox", id);
  const snap = await getDoc(msgRef);

  if (!snap.exists()) {
    threadEl.innerHTML = "<p>Message not found.</p>";
    return;
  }

  const root = snap.data() || {};
  const threadCol = collection(db, "paraCoachInbox", id, "thread");

  // Apply receipts ONCE on open
  applyParentReceipts({ msgRef, threadCol }).catch(() => {});

  // Prevent duplicate listeners
  if (unsub) { try { unsub(); } catch {} unsub = null; }

  // Live replies (bounded, ordered)
  const qRef = query(threadCol, orderBy("createdAt", "asc"), limit(THREAD_LIMIT_REPLIES));

  unsub = onSnapshot(
    qRef,
    (qs) => {
      // reset
      threadEl.innerHTML = "";
      lastSender = null;
      lastTimestamp = 0;

      // original parent message always first
      appendMessage({
        from: "parent",
        fromName: root.name || root.parentName || "Parent/Guardian",
        text: root.body || "",
        ts: root.createdAt?.toDate?.() || new Date()
      });

      // replies in order (already ordered)
      qs.forEach((d) => {
        const m = d.data() || {};
        appendMessage({
          from: m.from || "parent",
          fromName: m.fromName || (m.from === "coach" ? "Coach" : "Parent/Guardian"),
          text: m.body || m.text || "",
          ts: m.createdAt?.toDate?.() || new Date()
        });
      });

      const totalCount = 1 + qs.size; // root + replies
      enforceLimitUI(totalCount);

      // scroll bottom
      threadEl.scrollTop = threadEl.scrollHeight;

      // Every time it updates, re-apply receipts (cheap + safe, still one-shot)
      applyParentReceipts({ msgRef, threadCol }).catch(() => {});
    },
    (err) => {
      console.error("[parent-thread] onSnapshot error:", err);
      threadEl.innerHTML = "<p>Error loading thread.</p>";
    }
  );
}

loadThread();

// ------------------------------------------------------------
// SEND REPLY
// ------------------------------------------------------------
replyBtn?.addEventListener("click", async () => {
  const text = (replyInput?.value || "").trim();
  if (!text) return;

  // block send if limit banner is active / disabled
  if (replyBtn?.disabled || replyInput?.disabled) return;

  // quick disable to prevent double tap
  replyBtn.disabled = true;

  try {
    const ref = collection(db, "paraCoachInbox", id, "thread");

    await addDoc(ref, {
      from: testCoach ? "coach" : "parent",
      fromName: testCoach ? "Coach" : "Parent/Guardian",
      body: text,
      createdAt: serverTimestamp(),
      // parent messages don’t need parentSeen
    });

    replyInput.value = "";

    if (successMsg) {
      successMsg.style.display = "block";
      setTimeout(() => (successMsg.style.display = "none"), 1500);
    }
  } catch (e) {
    console.error("[parent-thread] send failed:", e);
  } finally {
    // re-enable only if input isn't locked by limit
    if (!replyInput?.disabled) replyBtn.disabled = false;
  }
});

// ------------------------------------------------------------
// CLEANUP
// ------------------------------------------------------------
window.addEventListener("beforeunload", () => {
  if (unsub) { try { unsub(); } catch {} unsub = null; }
});