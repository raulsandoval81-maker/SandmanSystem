// /communications/coach/inbox-view.js
// ------------------------------------------------------------
// Coach Join / Trial Thread
//
// Discipline-aware request review.
// Supports legacy request fields:
// - discipline
// - programInterest
// - interest
// - sport
// - art
// - track
//
// Existing request and reply behavior is preserved.
// ------------------------------------------------------------

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

/* =========================
   DOM
========================= */

const container =
  document.getElementById("thread");

const replyBox =
  document.getElementById("reply-body");

const replySubject =
  document.getElementById("reply-subject");

const btnSend =
  document.getElementById("btn-send-reply");

const btnMarkDone =
  document.getElementById("btn-mark-done");

const statusEl =
  document.getElementById("status");

const nameEl =
  document.getElementById("vol-name");

const athleteEl =
  document.getElementById("vol-athlete");

const typeEl =
  document.getElementById("vol-type");

const timeEl =
  document.getElementById("vol-time");

const availabilityEl =
  document.getElementById("vol-availability");

const disciplineEl =
  document.getElementById("vol-discipline");

const btnGotIt =
  document.getElementById("btn-got-it");

const btnReview =
  document.getElementById("btn-review");

const btnApproveTrial =
  document.getElementById(
    "btn-approve-trial"
  );

const btnApproveJoin =
  document.getElementById(
    "btn-approve-join"
  );

const btnNoted =
  document.getElementById("btn-noted");

/* =========================
   STATE
========================= */

const params =
  new URLSearchParams(
    window.location.search
  );

const id =
  String(params.get("id") || "")
    .trim();

let sending = false;

/* =========================
   HELPERS
========================= */

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeDate(timestamp) {
  try {
    const date =
      timestamp?.toDate?.() ||
      (
        timestamp
          ? new Date(timestamp)
          : null
      );

    if (
      !date ||
      Number.isNaN(date.getTime())
    ) {
      return "";
    }

    return date.toLocaleString();
  } catch {
    return "";
  }
}

function setStatus(
  message = "",
  isError = false
) {
  if (!statusEl) return;

  statusEl.textContent =
    message;

  statusEl.style.color =
    isError
      ? "#fecaca"
      : "#ffdd48";
}

function scrollToBottom() {
  if (!container) return;

  container.scrollTop =
    container.scrollHeight;
}

function normalizeDiscipline(
  value = ""
) {
  const raw =
    String(value || "")
      .trim()
      .toLowerCase();

  if (raw.includes("kickbox")) {
    return "kickboxing";
  }

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (
    raw === "mma" ||
    raw.includes("mixed martial")
  ) {
    return "mma";
  }

  if (
    raw.includes("submission") ||
    raw.includes("grappling")
  ) {
    return "submission-grappling";
  }

  if (raw.includes("box")) {
    return "boxing";
  }

  return raw;
}

function getDiscipline(data = {}) {
  return normalizeDiscipline(
    data.discipline ||
    data.programInterest ||
    data.interest ||
    data.sport ||
    data.art ||
    data.trackDiscipline ||
    data.program ||
    ""
  );
}

function disciplineLabel(
  value = ""
) {
  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    kickboxing: "Kickboxing",
    mma: "MMA",
    "submission-grappling":
      "Submission Grappling"
  };

  const normalized =
    normalizeDiscipline(value);

  if (labels[normalized]) {
    return labels[normalized];
  }

  if (!normalized) {
    return "General";
  }

  return normalized
    .split("-")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function trackLabel(value = "") {
  const raw =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    raw === "foundry8" ||
    raw === "f8"
  ) {
    return "Foundry 8";
  }

  if (
    raw === "foundry4" ||
    raw === "f4"
  ) {
    return "Foundry 4";
  }

  if (
    raw.includes("zero2hero") ||
    raw.includes("z2h")
  ) {
    return "Zero2Hero";
  }

  if (
    raw.includes("path2legend") ||
    raw.includes("p2l")
  ) {
    return "Path2Legend";
  }

  if (
    raw.includes("quest2mastery") ||
    raw.includes("q2m")
  ) {
    return "Quest2Mastery";
  }

  return value || "";
}

function getIntentLabel(
  entryType = ""
) {
  const normalized =
    String(entryType || "")
      .trim()
      .toLowerCase();

  if (normalized === "free_pass") {
    return "1-Day Assessment";
  }

  if (normalized === "trial") {
    return "3-Day Trial";
  }

  if (normalized === "join") {
    return "Join Request";
  }

  return "Request";
}

function getTimeAgo(timestamp) {
  try {
    const date =
      timestamp?.toDate?.() ||
      (
        timestamp
          ? new Date(timestamp)
          : null
      );

    if (
      !date ||
      Number.isNaN(date.getTime())
    ) {
      return "";
    }

    const difference =
      Date.now() - date.getTime();

    const minutes =
      Math.floor(
        difference / 60000
      );

    if (minutes < 5) {
      return "JUST NOW";
    }

    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours =
      Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days =
      Math.floor(hours / 24);

    return `${days}d ago`;
  } catch {
    return "";
  }
}

/* =========================
   MESSAGE RENDER
========================= */

function buildMsg(message = {}) {
  const from =
    String(message.from || "")
      .trim()
      .toLowerCase();

  const fromName =
    message.fromName ||
    (
      from === "coach"
        ? "Coach"
        : "Parent"
    );

  const subject =
    String(
      message.subject || ""
    ).trim();

  return `
    <div class="msg ${esc(from || "parent")}">

      <div class="meta">
        ${esc(fromName)}
        •
        ${esc(safeDate(message.createdAt))}
      </div>

      ${
        subject
          ? `
            <div
              class="subject"
              style="
                margin-top:6px;
                font-weight:900;
              "
            >
              ${esc(subject)}
            </div>
          `
          : ""
      }

      <div class="body">
        ${esc(message.body || "")}
      </div>

    </div>
  `;
}

/* =========================
   REQUEST SNAPSHOT
========================= */

function paintSnapshot(data = {}) {
  if (nameEl) {
    nameEl.textContent =
      data.parentName || "—";
  }

  if (athleteEl) {
    const age =
      data.athleteAge
        ? ` (${data.athleteAge})`
        : "";

    athleteEl.textContent =
      `${data.athleteName || "—"}${age}`;
  }

  if (typeEl) {
    typeEl.textContent =
      getIntentLabel(
        data.entryType
      );

    typeEl.classList.remove(
      "intent-high",
      "intent-mid",
      "intent-low"
    );

    if (
      data.entryType === "join"
    ) {
      typeEl.classList.add(
        "intent-high"
      );
    } else if (
      data.entryType === "trial"
    ) {
      typeEl.classList.add(
        "intent-mid"
      );
    } else {
      typeEl.classList.add(
        "intent-low"
      );
    }
  }

  if (timeEl) {
    timeEl.textContent =
      getTimeAgo(
        data.createdAt
      ) || "—";
  }

  const discipline =
    getDiscipline(data);

  const disciplineName =
    disciplineLabel(discipline);

  if (disciplineEl) {
    disciplineEl.textContent =
      disciplineName;
  }

  if (availabilityEl) {
    const pieces = [];

    const track =
      trackLabel(
        data.track ||
        data.programTrack ||
        data.journey ||
        ""
      );

    if (track) {
      pieces.push(track);
    }

    if (disciplineName) {
      pieces.push(
        disciplineName
      );
    }

    if (
      data.interest &&
      normalizeDiscipline(
        data.interest
      ) !== discipline
    ) {
      pieces.push(
        String(data.interest)
      );
    }

    if (data.preferredDays) {
      const preferredDays =
        Array.isArray(
          data.preferredDays
        )
          ? data.preferredDays.join(", ")
          : String(
              data.preferredDays
            );

      if (preferredDays) {
        pieces.push(
          preferredDays
        );
      }
    }

    availabilityEl.textContent =
      pieces.length
        ? pieces.join(" • ")
        : "—";
  }
}

function getRootRequestBody(data = {}) {
  const discipline =
    disciplineLabel(
      getDiscipline(data)
    );

  const track =
    trackLabel(
      data.track ||
      data.programTrack ||
      data.journey ||
      ""
    ) || "—";

  const preferredDays =
    Array.isArray(
      data.preferredDays
    )
      ? data.preferredDays.join(", ")
      : data.preferredDays || "—";

  return `
Parent: ${data.parentName || "—"}${data.parentEmail ? ` (${data.parentEmail})` : ""}
Phone: ${data.phone || data.parentPhone || "—"}

Athlete: ${data.athleteName || "—"}${data.athleteAge ? ` (${data.athleteAge})` : ""}
School: ${data.school || "—"}

Request: ${getIntentLabel(data.entryType)}
Journey: ${track}
Discipline: ${discipline}
Preferred Days: ${preferredDays}

Message:
${data.message || "(none)"}
  `.trim();
}

/* =========================
   LOAD THREAD
========================= */

async function load() {
  if (!id) {
    if (container) {
      container.innerHTML = `
        <div class="thread-empty">
          Missing join thread ID.
        </div>
      `;
    }

    return;
  }

  const requestRef =
    doc(
      db,
      "paraParentInbox",
      id
    );

  const requestSnap =
    await getDoc(requestRef);

  if (!requestSnap.exists()) {
    if (container) {
      container.innerHTML = `
        <div class="thread-empty">
          Join request not found.
        </div>
      `;
    }

    return;
  }

  const data =
    requestSnap.data() || {};

  paintSnapshot(data);

  await updateDoc(
    requestRef,
    {
      coachHasUnread: false,
      seenByCoach: true,
      updatedAt:
        serverTimestamp()
    }
  ).catch(() => {});

  const rows = [];

  const rootBody =
    getRootRequestBody(data);

  const threadQuery =
    query(
      collection(
        db,
        "paraParentInbox",
        id,
        "thread"
      ),
      orderBy(
        "createdAt",
        "asc"
      )
    );

  const threadSnap =
    await getDocs(threadQuery);

  if (
    threadSnap.empty &&
    rootBody
  ) {
    rows.push(
      buildMsg({
        from: "parent",
        fromName:
          data.parentName ||
          "Parent",
        body: rootBody,
        createdAt:
          data.createdAt
      })
    );
  }

  threadSnap.forEach(
    (document) => {
      rows.push(
        buildMsg(
          document.data() || {}
        )
      );
    }
  );

  if (container) {
    container.innerHTML =
      rows.length
        ? rows.join("")
        : `
          <div class="thread-empty">
            No messages yet.
          </div>
        `;
  }

  scrollToBottom();
}

/* =========================
   SEND REPLY
========================= */

async function sendReply() {
  if (
    sending ||
    !id
  ) {
    return;
  }

  const text =
    String(
      replyBox?.value || ""
    ).trim();

  const subject =
    String(
      replySubject?.value || ""
    ).trim();

  if (!text) {
    setStatus(
      "Reply message is empty.",
      true
    );

    return;
  }

  sending = true;

  if (btnSend) {
    btnSend.disabled = true;
  }

  setStatus(
    "Sending reply..."
  );

  try {
    const threadRef =
      collection(
        db,
        "paraParentInbox",
        id,
        "thread"
      );

    await addDoc(
      threadRef,
      {
        from: "coach",
        fromName: "Coach",
        subject:
          subject || null,
        body: text,
        createdAt:
          serverTimestamp(),
        seenByCoach: true,
        seenByParent: false
      }
    );

    await updateDoc(
      doc(
        db,
        "paraParentInbox",
        id
      ),
      {
        parentHasUnread: true,
        coachHasUnread: false,
        seenByCoach: true,
        seenByParent: false,
        lastReplyFrom: "coach",
        lastReplyAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp()
      }
    );

    if (replyBox) {
      replyBox.value = "";
    }

    setStatus(
      "Reply sent."
    );

    await load();
  } catch (error) {
    console.error(
      "[join inbox-view] send failed:",
      error
    );

    setStatus(
      "Reply failed.",
      true
    );
  } finally {
    sending = false;

    if (btnSend) {
      btnSend.disabled = false;
    }
  }
}

/* =========================
   STATUS ACTIONS
========================= */

async function markDone() {
  if (!id) return;

  if (btnMarkDone) {
    btnMarkDone.disabled = true;
  }

  setStatus(
    "Closing request..."
  );

  try {
    await updateDoc(
      doc(
        db,
        "paraParentInbox",
        id
      ),
      {
        status: "archived",
        archivedAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp()
      }
    );

    setStatus(
      "Request archived."
    );

    await load();
  } catch (error) {
    console.error(
      "[join inbox-view] archive failed:",
      error
    );

    setStatus(
      "Failed to archive request.",
      true
    );
  } finally {
    if (btnMarkDone) {
      btnMarkDone.disabled =
        false;
    }
  }
}

async function approveTrial() {
  if (!id) return;

  if (btnApproveTrial) {
    btnApproveTrial.disabled =
      true;
  }

  setStatus(
    "Approving trial..."
  );

  try {
    await updateDoc(
      doc(
        db,
        "paraParentInbox",
        id
      ),
      {
        status:
          "approved_trial",
        approvedAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp()
      }
    );

    setStatus(
      "Trial approved."
    );

    await load();
  } catch (error) {
    console.error(
      "[join inbox-view] trial approval failed:",
      error
    );

    setStatus(
      "Trial approval failed.",
      true
    );
  } finally {
    if (btnApproveTrial) {
      btnApproveTrial.disabled =
        false;
    }
  }
}

async function approveJoin() {
  if (!id) return;

  if (btnApproveJoin) {
    btnApproveJoin.disabled =
      true;
  }

  setStatus(
    "Approving join..."
  );

  try {
    await updateDoc(
      doc(
        db,
        "paraParentInbox",
        id
      ),
      {
        status:
          "approved_join",
        approvedAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp()
      }
    );

    setStatus(
      "Join approved."
    );

    await load();
  } catch (error) {
    console.error(
      "[join inbox-view] join approval failed:",
      error
    );

    setStatus(
      "Join approval failed.",
      true
    );
  } finally {
    if (btnApproveJoin) {
      btnApproveJoin.disabled =
        false;
    }
  }
}

/* =========================
   EVENT BINDINGS
========================= */

btnApproveTrial?.addEventListener(
  "click",
  approveTrial
);

btnApproveJoin?.addEventListener(
  "click",
  approveJoin
);

btnSend?.addEventListener(
  "click",
  sendReply
);

btnMarkDone?.addEventListener(
  "click",
  markDone
);

btnGotIt?.addEventListener(
  "click",
  () => {
    if (replyBox) {
      replyBox.value =
        "Got it, thank you!";
    }

    if (
      replySubject &&
      !replySubject.value.trim()
    ) {
      replySubject.value =
        "Join Request Follow-Up";
    }
  }
);

btnReview?.addEventListener(
  "click",
  () => {
    if (replyBox) {
      replyBox.value =
        "I'll review this and get back to you shortly.";
    }

    if (
      replySubject &&
      !replySubject.value.trim()
    ) {
      replySubject.value =
        "Request Under Review";
    }
  }
);

btnNoted?.addEventListener(
  "click",
  () => {
    if (replyBox) {
      replyBox.value =
        "Noted. Thank you.";
    }

    if (
      replySubject &&
      !replySubject.value.trim()
    ) {
      replySubject.value =
        "Join Request Update";
    }
  }
);

load().catch((error) => {
  console.error(
    "[join inbox-view] load failed:",
    error
  );

  setStatus(
    "Unable to load request.",
    true
  );

  if (container) {
    container.innerHTML = `
      <div class="thread-empty">
        Unable to load this request.
      </div>
    `;
  }
});