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

const ROOT_COLLECTION = "paraThreads";
const THREAD_LIMIT = 12;

const LIMIT_BANNER_MSG =
  "This conversation has reached its text limit (12). Please schedule a call or meet in person.";

// DOM
const container = document.getElementById("thread-container");
const replyBox = document.getElementById("reply-body");
const btnSendReply = document.getElementById("btn-send-reply");
const btnArchive = document.getElementById("btn-archive");
const btnDelete = document.getElementById("btn-delete");

const qrSelect = document.getElementById("qr-select");
const qrInsert = document.getElementById("qr-insert");

// URL params
const params = new URLSearchParams(window.location.search);
const athleteUid = String(params.get("athleteUid") || params.get("id") || "").trim();

// ---------- helpers ----------
function safeDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : ts;
  try {
    return d.toLocaleString();
  } catch {
    return "";
  }
}

function escapeHTML(str = "") {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[c]);
}

async function safeMergeUpdate(ref, data) {
  try {
    await updateDoc(ref, data);
  } catch {
    await setDoc(ref, data, { merge: true });
  }
}

function scrollToBottomFast() {
  if (!container) return;
  requestAnimationFrame(() => {
    try {
      container.scrollTop = container.scrollHeight;
    } catch {}
  });
}

function renderMissingThreadId() {
  if (!container) return;
  container.innerHTML = `
    <div class="thread-empty">
      Missing athlete/thread ID. Open this page with ?athleteUid=F4_0001
    </div>
  `;
}

function renderThreadNotFound() {
  if (!container) return;
  container.innerHTML = `
    <div class="thread-empty">
      Thread not found. This athlete thread may not exist yet.
    </div>
  `;
}

function renderSystemNote(text = "") {
  return `<div class="thread-empty">${escapeHTML(text)}</div>`;
}

function buildThreadMessage(msg) {
  const isCoach = String(msg.from || "").toLowerCase() === "coach";
  const displayName = msg.fromName || (isCoach ? "Coach" : "Parent/Guardian");
  const when = safeDate(msg.createdAt);

  const receipt = isCoach
    ? (msg.seenByParent === true ? "Seen" : "Delivered")
    : "";

  const receiptHTML = isCoach
    ? `<div class="msg-time" style="margin-top:6px;">${escapeHTML(receipt)}</div>`
    : "";

  return `
    <div class="msg ${isCoach ? "coach" : "parent"}">
      <div class="msg-head">
        <div class="msg-from">${escapeHTML(displayName)}</div>
        <div class="msg-time">${escapeHTML(when)}</div>
      </div>
      <div class="msg-body">${escapeHTML(msg.body || "")}</div>
      ${receiptHTML}
    </div>
  `;
}

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
    banner.className = "thread-empty";
    banner.style.fontWeight = "800";
    banner.style.paddingBottom = "10px";
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
          jobs.push(
            updateDoc(ds.ref, {
              seenByCoach: true,
              seenByCoachAt: serverTimestamp()
            })
          );
        }
      });

      if (jobs.length) await Promise.allSettled(jobs);
    } catch (e) {
      console.warn("[coach-thread] seenByCoach sweep failed:", e);
    }
  }, 250);
}

// quick replies
function bindQuickReplies() {
  if (!qrSelect || !qrInsert || !replyBox) return;

  qrInsert.addEventListener("click", () => {
    const text = String(qrSelect.value || "").trim();
    if (!text) return;

    replyBox.value = replyBox.value
      ? `${replyBox.value.trimEnd()}\n\n${text}`
      : text;

    replyBox.focus();
    qrSelect.value = "";
  });
}

bindQuickReplies();

// -------------------- main load --------------------
let unsub = null;
let currentWindowCount = 0;
let currentHasMoreThanLimit = false;

async function loadThread() {
  if (!container) return;

  if (!athleteUid) {
    renderMissingThreadId();
    return;
  }

  const rootRef = doc(db, ROOT_COLLECTION, athleteUid);

  let snap;
  try {
    snap = await getDoc(rootRef);
  } catch (err) {
    console.error("[coach-thread] root load error:", err);
    container.innerHTML = renderSystemNote("Failed to load thread.");
    return;
  }

  if (!snap.exists()) {
    renderThreadNotFound();
    return;
  }

  const root = snap.data() || {};
  const athleteName = root.athleteName || athleteUid;

  // optional header support if you have these DOM nodes
  const titleEl = document.getElementById("thread-title");
  const subEl = document.getElementById("thread-subtitle");
  if (titleEl) titleEl.textContent = athleteName;
  if (subEl) subEl.textContent = `Athlete thread · ${athleteUid}`;

  // coach opened: clear coach unread now
  safeMergeUpdate(rootRef, {
    coachOpenedAt: serverTimestamp(),
    coachHasUnread: false,
    seenByCoach: true,
    updatedAt: serverTimestamp()
  }).catch(() => {});

  const threadCol = collection(db, ROOT_COLLECTION, athleteUid, "messages");

  const qRef = query(
    threadCol,
    orderBy("createdAt", "desc"),
    limit(THREAD_LIMIT + 1)
  );

  if (unsub) {
    try {
      unsub();
    } catch {}
    unsub = null;
  }

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
          renderSystemNote(`Showing latest ${THREAD_LIMIT} messages.`)
        );
      }

      if (!docsToShow.length) {
        container.insertAdjacentHTML(
          "beforeend",
          renderSystemNote("No messages yet.")
        );
      } else {
        docsToShow.forEach((d) => {
          const t = d.data() || {};
          const fromLower = String(t.from || "parent").toLowerCase();

          container.insertAdjacentHTML(
            "beforeend",
            buildThreadMessage({
              from: fromLower,
              fromName: t.fromName || (fromLower === "coach" ? "Coach" : "Parent/Guardian"),
              body: t.body || "",
              createdAt: t.createdAt,
              seenByParent: t.seenByParent === true,
              seenByCoach: t.seenByCoach === true
            })
          );
        });
      }

      enforceThreadLimit(currentWindowCount, currentHasMoreThanLimit);

      if (qs.size > 0) {
        scheduleCoachSeenSweep(qs);
      }

      scrollToBottomFast();
    },
    (err) => {
      console.error("[coach-thread] onSnapshot error:", err);
      container.innerHTML = renderSystemNote("Error loading thread.");
    }
  );
}

// -------------------- send reply --------------------
if (btnSendReply && replyBox) {
  btnSendReply.addEventListener("click", async () => {
    const text = replyBox.value.trim();
    if (!text || !athleteUid) return;

    if (currentWindowCount >= THREAD_LIMIT || currentHasMoreThanLimit) {
      enforceThreadLimit(currentWindowCount, currentHasMoreThanLimit);
      return;
    }

    if (replyBox.disabled || btnSendReply.disabled) return;

    const rootRef = doc(db, ROOT_COLLECTION, athleteUid);
    const threadCol = collection(db, ROOT_COLLECTION, athleteUid, "messages");

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
        seenByCoach: true
      });

      await safeMergeUpdate(rootRef, {
        lastBody: text,
        lastReplyAt: serverTimestamp(),
        parentHasUnread: true,
        coachHasUnread: false,
        seenByCoach: true,
        updatedAt: serverTimestamp()
      });

      replyBox.value = "";
      replyBox.focus();
    } catch (err) {
      console.error("[coach-thread] send reply error:", err);
      alert("Send failed. Check console.");
    } finally {
      btnSendReply.textContent = old || "Send Reply";
      btnSendReply.disabled = replyBox?.disabled === true;
    }
  });
}

// -------------------- archive / delete --------------------
if (btnArchive) {
  btnArchive.addEventListener("click", async () => {
    if (!athleteUid) return;

    try {
      await safeMergeUpdate(doc(db, ROOT_COLLECTION, athleteUid), {
        archived: true,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      alert("Thread archived.");
      window.location.href = "/communications/coach/hub.html";
    } catch (e) {
      console.error("[coach-thread] archive error:", e);
    }
  });
}

if (btnDelete) {
  btnDelete.addEventListener("click", async () => {
    if (!athleteUid) return;
    if (!confirm("Delete this thread?")) return;

    try {
      await safeMergeUpdate(doc(db, ROOT_COLLECTION, athleteUid), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      alert("Thread deleted.");
      window.location.href = "/communications/coach/hub.html";
    } catch (e) {
      console.error("[coach-thread] delete error:", e);
    }
  });
}

// cleanup
window.addEventListener("beforeunload", () => {
  if (unsub) {
    try {
      unsub();
    } catch {}
    unsub = null;
  }

  if (sweepTimer) {
    try {
      clearTimeout(sweepTimer);
    } catch {}
    sweepTimer = null;
  }
});

// init
loadThread();