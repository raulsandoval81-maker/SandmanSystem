import {
  db,
  ensureSignedIn,
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const container = document.getElementById("thread");
const replyBox = document.getElementById("reply-body");
const replySubject = document.getElementById("reply-subject");
const btnSend = document.getElementById("btn-send-reply");
const btnMarkDone = document.getElementById("btn-mark-done");
const statusEl = document.getElementById("status");

const nameEl = document.getElementById("vol-name");
const athleteEl = document.getElementById("vol-athlete");
const typeEl = document.getElementById("vol-type");
const timeEl = document.getElementById("vol-time");
const availabilityEl = document.getElementById("vol-availability");

const btnGotIt = document.getElementById("btn-got-it");
const btnReview = document.getElementById("btn-review");
const btnApproveTrial = document.getElementById("btn-approve-trial");
const btnApproveJoin = document.getElementById("btn-approve-join");
const btnNoted = document.getElementById("btn-noted");

const params = new URLSearchParams(location.search);
const id = params.get("id");

let sending = false;

function esc(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safeDate(ts) {
  try {
    return ts?.toDate?.().toLocaleString() || "";
  } catch {
    return "";
  }
}

function setStatus(msg = "", isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#fecaca" : "#ffdd48";
}

function scrollToBottom() {
  if (!container) return;
  container.scrollTop = container.scrollHeight;
}

function buildMsg(m = {}) {
  const from = String(m.from || "").toLowerCase();
  const fromName = m.fromName || (from === "coach" ? "Coach" : "Parent");

  return `
    <div class="msg ${esc(from || "parent")}">
      <div class="meta">
        ${esc(fromName)} • ${esc(safeDate(m.createdAt))}
      </div>
      <div class="body">${esc(m.body || "")}</div>
    </div>
  `;
}
function getIntentLabel(entryType) {
  if (entryType === "free_pass") return "1-Day Assessment";
  if (entryType === "trial") return "3-Day Trial";
  if (entryType === "join") return "Join Request";
  return "Request";
}

function getTimeAgo(ts) {
  try {
    const date = ts?.toDate?.();
    if (!date) return "";

    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);

    if (mins < 5) return "JUST NOW";
    if (mins < 60) return `${mins}m ago`;

    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

function paintSnapshot(d = {}) {
  if (nameEl) {
    nameEl.textContent = d.parentName || "—";
  }

  if (athleteEl) {
    const age = d.athleteAge ? ` (${d.athleteAge})` : "";
    athleteEl.textContent = `${d.athleteName || "—"}${age}`;
  }

  if (typeEl) {
    typeEl.textContent = getIntentLabel(d.entryType);

    typeEl.classList.remove("intent-high", "intent-mid", "intent-low");

    if (d.entryType === "join") typeEl.classList.add("intent-high");
    else if (d.entryType === "trial") typeEl.classList.add("intent-mid");
    else typeEl.classList.add("intent-low");
  }

  if (timeEl) {
    timeEl.textContent = getTimeAgo(d.createdAt) || "—";
  }

  if (availabilityEl) {
    const pieces = [];

    if (d.track) {
      pieces.push(
        d.track === "foundry8"
          ? "Foundry 8"
          : d.track === "foundry4"
          ? "Foundry 4"
          : d.track
      );
    }

    if (d.interest) {
      pieces.push(d.interest);
    }

    availabilityEl.textContent = pieces.length
      ? pieces.join(" • ")
      : "—";
  }
}

function getRootRequestBody(d = {}) {
  return `
Parent: ${d.parentName || "—"}${d.parentEmail ? ` (${d.parentEmail})` : ""}
Athlete: ${d.athleteName || "—"}${d.athleteAge ? ` (${d.athleteAge})` : ""}
Type: ${getIntentLabel(d.entryType)}
Track: ${d.track || "—"}

Message:
${d.message || "(none)"}
`.trim();
}
async function load() {
  if (!id) {
    if (container) {
      container.innerHTML = `<div class="thread-empty">Missing join thread ID.</div>`;
    }
    return;
  }

  const ref = doc(db, "paraParentInbox", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    if (container) {
      container.innerHTML = `<div class="thread-empty">Join request not found.</div>`;
    }
    return;
  }

  const d = snap.data() || {};
  paintSnapshot(d);

  await updateDoc(ref, {
    coachHasUnread: false,
    seenByCoach: true,
    updatedAt: serverTimestamp()
  }).catch(() => {});

  const rows = [];
  const rootBody = getRootRequestBody(d);

  const tRef = query(
    collection(db, "paraParentInbox", id, "thread"),
    orderBy("createdAt", "asc")
  );

  const tSnap = await getDocs(tRef);

  if (tSnap.empty && rootBody) {
    rows.push(buildMsg({
      from: "parent",
      fromName: d.parentName || "Parent",
      body: rootBody,
      createdAt: d.createdAt
    }));
  }

  tSnap.forEach((ds) => {
    rows.push(buildMsg(ds.data() || {}));
  });

  if (container) {
    container.innerHTML = rows.length
      ? rows.join("")
      : `<div class="thread-empty">No messages yet.</div>`;
  }

  scrollToBottom();
}

async function sendReply() {
  if (sending || !id) return;

  const text = String(replyBox?.value || "").trim();
  const subject = String(replySubject?.value || "").trim();

  if (!text) {
    setStatus("Reply message is empty.", true);
    return;
  }

  sending = true;
  if (btnSend) btnSend.disabled = true;
  setStatus("Sending reply...");

  try {
    const threadRef = collection(db, "paraParentInbox", id, "thread");

    await addDoc(threadRef, {
      from: "coach",
      fromName: "Coach",
      subject: subject || null,
      body: text,
      createdAt: serverTimestamp(),
      seenByCoach: true,
      seenByParent: false
    });

    await updateDoc(doc(db, "paraParentInbox", id), {
      parentHasUnread: true,
      coachHasUnread: false,
      seenByCoach: true,
      seenByParent: false,
      updatedAt: serverTimestamp()
    });

    if (replyBox) replyBox.value = "";
    setStatus("Reply sent.");
    await load();

  } catch (err) {
    console.error("[join inbox-view] send failed:", err);
    setStatus("Reply failed.", true);
  } finally {
    sending = false;
    if (btnSend) btnSend.disabled = false;
  }
}

async function markDone() {
  if (!id) return;
  if (btnMarkDone) btnMarkDone.disabled = true;
  setStatus("Closing request...");

  try {
    await updateDoc(doc(db, "paraParentInbox", id), {
      status: "archived",
      updatedAt: serverTimestamp()
    });

    setStatus("Request archived.");
    await load();
  } catch (err) {
    console.error("[join inbox-view] archive failed:", err);
    setStatus("Failed to archive request.", true);
  } finally {
    if (btnMarkDone) btnMarkDone.disabled = false;
  }
}
async function approveTrial() {
  if (!id) return;
  setStatus("Approving trial...");

  await updateDoc(doc(db, "paraParentInbox", id), {
    status: "approved_trial",
    approvedAt: serverTimestamp()
  });

  setStatus("Trial approved.");
  await load();
}

async function approveJoin() {
  if (!id) return;
  setStatus("Approving join...");

  await updateDoc(doc(db, "paraParentInbox", id), {
    status: "approved_join",
    approvedAt: serverTimestamp()
  });

  setStatus("Join approved.");
  await load();
}

btnApproveTrial?.addEventListener("click", approveTrial);
btnApproveJoin?.addEventListener("click", approveJoin);
btnSend?.addEventListener("click", async () => {
  await sendReply();
});

btnMarkDone?.addEventListener("click", async () => {
  await markDone();
});

btnGotIt?.addEventListener("click", () => {
  if (replyBox) replyBox.value = "Got it, thank you!";
  if (replySubject && !replySubject.value.trim()) {
    replySubject.value = "Join Request Follow-Up";
  }
});

btnReview?.addEventListener("click", () => {
  if (replyBox) replyBox.value = "I'll review this and get back to you shortly.";
  if (replySubject && !replySubject.value.trim()) {
    replySubject.value = "Request Under Review";
  }
});

btnNoted?.addEventListener("click", () => {
  if (replyBox) replyBox.value = "Noted. Thank you.";
  if (replySubject && !replySubject.value.trim()) {
    replySubject.value = "Join Request Update";
  }
});

load();