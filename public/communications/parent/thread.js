// ------------------------------------------------------------
// /communications/parent/thread.js
// Parent Athlete-Centered Communication Thread
//
// Thread root:
//   paraThreads/{athleteUid}
//
// Messages:
//   paraThreads/{athleteUid}/messages/{messageId}
//
// Rules:
// - one thread per athlete
// - athleteUid is the thread document ID
// - parent must be linked to the athlete
// - parent open clears parentHasUnread
// - coach messages are marked seenByParent
// - hard conversation limit: 12 total messages
// ------------------------------------------------------------

import {
  db,
  auth,
  ensureSignedIn,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
  onSnapshot
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

/* =========================
   CONFIG
========================= */

const THREAD_COLLECTION =
  "paraThreads";

const THREAD_LIMIT = 12;

const LIMIT_MESSAGE =
  "This conversation has reached its 12-message limit. Please schedule a call or meet with the coach in person.";

const GROUP_WINDOW_MS =
  2 * 60 * 1000;

/* =========================
   URL
========================= */

const params =
  new URLSearchParams(
    window.location.search
  );

const athleteUid =
  String(
    params.get("athleteUid") ||
    params.get("id") ||
    ""
  )
    .trim()
    .toUpperCase();

/* =========================
   DOM
========================= */

const threadEl =
  document.getElementById("thread");

const replyInput =
  document.getElementById("reply-text");

const replyBtn =
  document.getElementById("reply-send");

const successMsg =
  document.getElementById("reply-success");

const errorMsg =
  document.getElementById("reply-error");

const athleteNameEl =
  document.getElementById(
    "thread-athlete"
  );

const disciplineEl =
  document.getElementById(
    "thread-discipline"
  );

const replyPanel =
  document.getElementById(
    "reply-panel"
  );

if (!athleteUid) {
  if (threadEl) {
    threadEl.innerHTML =
      `<p>Missing athlete ID.</p>`;
  }

  throw new Error(
    "[parent-thread] Missing athleteUid"
  );
}

if (!threadEl) {
  throw new Error(
    "[parent-thread] Missing #thread element"
  );
}

/* =========================
   STATE
========================= */

let unsubscribeMessages = null;

let lastSender = null;
let lastTimestamp = 0;

let currentMessageCount = 0;
let threadLocked = false;

let threadRoot = null;

/* =========================
   HELPERS
========================= */

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

  return normalized
    ? normalized
        .split("-")
        .map(
          (part) =>
            part.charAt(0).toUpperCase() +
            part.slice(1)
        )
        .join(" ")
    : "General";
}

function toDate(value) {
  try {
    if (
      value &&
      typeof value.toDate === "function"
    ) {
      return value.toDate();
    }

    if (value) {
      const date =
        new Date(value);

      if (
        !Number.isNaN(
          date.getTime()
        )
      ) {
        return date;
      }
    }
  } catch {}

  return new Date();
}

function showSuccess(
  message = "Reply sent."
) {
  if (!successMsg) return;

  successMsg.textContent =
    message;

  successMsg.style.display =
    "block";

  window.setTimeout(
    () => {
      successMsg.style.display =
        "none";
    },
    1500
  );
}

function showError(
  message = ""
) {
  if (!errorMsg) {
    if (message) {
      console.error(message);
    }

    return;
  }

  errorMsg.textContent =
    message;

  errorMsg.style.display =
    message
      ? "block"
      : "none";
}

function scrollToBottom() {
  threadEl.scrollTop =
    threadEl.scrollHeight;
}

/* =========================
   PARENT AUTHORIZATION
========================= */

async function parentHasAthleteLink(
  parentUid,
  requestedAthleteUid
) {
  const linksQuery =
    query(
      collection(
        db,
        "parentAthleteLinks"
      )
    );

  const snapshot =
    await getDocs(linksQuery);

  return snapshot.docs.some(
    (document) => {
      const data =
        document.data() || {};

      return (
        String(
          data.parentUid || ""
        ) === String(parentUid) &&
        String(
          data.athleteUid || ""
        )
          .trim()
          .toUpperCase() ===
          requestedAthleteUid
      );
    }
  );
}

async function authorizeParent() {
  const parentUid =
    auth.currentUser?.uid || "";

  if (!parentUid) {
    throw new Error(
      "Parent sign-in required."
    );
  }

  const linked =
    await parentHasAthleteLink(
      parentUid,
      athleteUid
    );

  if (linked) {
    return;
  }

  /*
    Legacy fallback for athletes that still carry
    parentUid directly on the athlete document.
  */
  const athleteRef =
    doc(
      db,
      "athletes",
      athleteUid
    );

  const athleteSnap =
    await getDoc(athleteRef);

  if (!athleteSnap.exists()) {
    throw new Error(
      "Athlete not found."
    );
  }

  const athlete =
    athleteSnap.data() || {};

  if (
    String(
      athlete.parentUid || ""
    ) !== String(parentUid)
  ) {
    throw new Error(
      "This parent account is not linked to the athlete."
    );
  }
}

/* =========================
   LIMIT UI
========================= */

function ensureLimitBanner() {
  let banner =
    document.getElementById(
      "thread-limit-banner"
    );

  if (banner) return banner;

  banner =
    document.createElement("div");

  banner.id =
    "thread-limit-banner";

  banner.textContent =
    LIMIT_MESSAGE;

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

  threadEl.prepend(banner);

  return banner;
}

function removeLimitBanner() {
  document
    .getElementById(
      "thread-limit-banner"
    )
    ?.remove();
}

function enforceLimitUI(
  messageCount
) {
  currentMessageCount =
    Number(messageCount || 0);

  threadLocked =
    currentMessageCount >=
    THREAD_LIMIT;

  if (replyInput) {
    replyInput.disabled =
      threadLocked;
  }

  if (replyBtn) {
    replyBtn.disabled =
      threadLocked;
  }

  if (replyPanel) {
    replyPanel.hidden =
      threadLocked;
  }

  if (threadLocked) {
    ensureLimitBanner();
  } else {
    removeLimitBanner();
  }

  return threadLocked;
}

/* =========================
   MESSAGE RENDERING
========================= */

function resetGrouping() {
  lastSender = null;
  lastTimestamp = 0;
}

function appendMessage(
  message = {}
) {
  const from =
    String(
      message.from || "parent"
    )
      .trim()
      .toLowerCase();

  const isCoach =
    from === "coach";

  const sender =
    message.fromName ||
    (
      isCoach
        ? "Coach"
        : "Parent/Guardian"
    );

  const date =
    toDate(
      message.createdAt
    );

  const timeValue =
    date.getTime();

  const sameSender =
    sender === lastSender;

  const closeInTime =
    timeValue - lastTimestamp <=
    GROUP_WINDOW_MS;

  let groupEl = null;

  if (
    sameSender &&
    closeInTime
  ) {
    const groups =
      threadEl.querySelectorAll(
        ".msg-group"
      );

    groupEl =
      groups[
        groups.length - 1
      ] || null;
  }

  if (!groupEl) {
    groupEl =
      document.createElement("div");

    groupEl.className =
      `msg-group ${
        isCoach
          ? "coach"
          : "parent"
      }`;

    const fromLabel =
      document.createElement("div");

    fromLabel.className =
      "group-from";

    fromLabel.textContent =
      sender;

    groupEl.appendChild(
      fromLabel
    );

    threadEl.appendChild(
      groupEl
    );
  }

  const bubble =
    document.createElement("div");

  bubble.className =
    "msg-bubble";

  bubble.textContent =
    message.body ||
    message.text ||
    "";

  const stamp =
    document.createElement("div");

  stamp.className =
    "msg-stamp";

  stamp.textContent =
    date.toLocaleString();

  if (
    isCoach &&
    message.seenByParent === true
  ) {
    stamp.textContent +=
      " · Seen";
  }

  const wrapper =
    document.createElement("div");

  wrapper.className =
    "bubble-wrap";

  wrapper.appendChild(
    bubble
  );

  wrapper.appendChild(
    stamp
  );

  groupEl.appendChild(
    wrapper
  );

  lastSender = sender;
  lastTimestamp = timeValue;
}

/* =========================
   RECEIPTS
========================= */

async function applyParentReceipts(
  threadRef,
  messages
) {
  try {
    await updateDoc(
      threadRef,
      {
        parentHasUnread: false,
        seenByParent: true,
        parentOpenedAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp()
      }
    );
  } catch (error) {
    console.warn(
      "[parent-thread] root receipt failed:",
      error
    );
  }

  const unseenCoachMessages =
    messages.filter(
      (message) =>
        message.from === "coach" &&
        message.seenByParent !== true
    );

  for (
    const message
    of unseenCoachMessages
  ) {
    try {
      await updateDoc(
        message.ref,
        {
          seenByParent: true,
          parentSeenAt:
            serverTimestamp()
        }
      );
    } catch (error) {
      console.warn(
        "[parent-thread] receipt update failed:",
        error
      );
    }
  }
}

/* =========================
   LOAD ROOT
========================= */

async function loadThreadRoot() {
  const threadRef =
    doc(
      db,
      THREAD_COLLECTION,
      athleteUid
    );

  const threadSnap =
    await getDoc(threadRef);

  if (!threadSnap.exists()) {
    threadEl.innerHTML =
      `<p>Thread not found.</p>`;

    return null;
  }

  const root =
    threadSnap.data() || {};

  threadRoot = root;

  if (athleteNameEl) {
    athleteNameEl.textContent =
      root.athleteName ||
      athleteUid;
  }

  if (disciplineEl) {
    disciplineEl.textContent =
      disciplineLabel(
        root.discipline ||
        root.primaryDiscipline ||
        ""
      );
  }

  return {
    ref: threadRef,
    data: root
  };
}

/* =========================
   LIVE LISTENER
========================= */

async function listenToMessages(
  threadRef
) {
  if (unsubscribeMessages) {
    try {
      unsubscribeMessages();
    } catch {}

    unsubscribeMessages = null;
  }

  const messagesQuery =
    query(
      collection(
        db,
        THREAD_COLLECTION,
        athleteUid,
        "messages"
      ),
      orderBy(
        "createdAt",
        "asc"
      ),
      limit(
        THREAD_LIMIT + 1
      )
    );

  unsubscribeMessages =
    onSnapshot(
      messagesQuery,
      async (snapshot) => {
        const messages =
          snapshot.docs.map(
            (document) => ({
              id: document.id,
              ref: document.ref,
              ...document.data()
            })
          );

        threadEl.innerHTML = "";
        resetGrouping();

        messages
          .slice(0, THREAD_LIMIT)
          .forEach(
            appendMessage
          );

        enforceLimitUI(
          messages.length
        );

        scrollToBottom();

        await applyParentReceipts(
          threadRef,
          messages
        );
      },
      (error) => {
        console.error(
          "[parent-thread] listener failed:",
          error
        );

        threadEl.innerHTML =
          `<p>Error loading thread.</p>`;
      }
    );
}

/* =========================
   BOOT
========================= */

async function boot() {
  try {
    await authorizeParent();

    const thread =
      await loadThreadRoot();

    if (!thread) return;

    await listenToMessages(
      thread.ref
    );
  } catch (error) {
    console.error(
      "[parent-thread] boot failed:",
      error
    );

    threadEl.innerHTML = `
      <p>
        ${escapeHTML(
          error?.message ||
          "Unable to load this thread."
        )}
      </p>
    `;
  }
}

await boot();

/* =========================
   SEND
========================= */

replyBtn?.addEventListener(
  "click",
  async () => {
    showError("");

    const text =
      String(
        replyInput?.value || ""
      ).trim();

    if (!text) {
      showError(
        "Enter a reply first."
      );

      return;
    }

    if (
      threadLocked ||
      currentMessageCount >=
        THREAD_LIMIT
    ) {
      enforceLimitUI(
        currentMessageCount
      );

      return;
    }

    replyBtn.disabled = true;

    if (replyInput) {
      replyInput.disabled = true;
    }

    try {
      /*
        Recheck immediately before writing.
      */
      const countQuery =
        query(
          collection(
            db,
            THREAD_COLLECTION,
            athleteUid,
            "messages"
          ),
          orderBy(
            "createdAt",
            "desc"
          ),
          limit(
            THREAD_LIMIT
          )
        );

      const countSnapshot =
        await getDocs(
          countQuery
        );

      if (
        countSnapshot.size >=
        THREAD_LIMIT
      ) {
        enforceLimitUI(
          countSnapshot.size
        );

        return;
      }

      const parentName =
        auth.currentUser
          ?.displayName ||
        threadRoot?.parentName ||
        "Parent/Guardian";

      await addDoc(
        collection(
          db,
          THREAD_COLLECTION,
          athleteUid,
          "messages"
        ),
        {
          from: "parent",
          fromUid:
            auth.currentUser?.uid ||
            "",
          fromName:
            parentName,
          body: text,
          athleteUid,
          discipline:
            normalizeDiscipline(
              threadRoot?.discipline ||
              threadRoot
                ?.primaryDiscipline ||
              ""
            ),
          createdAt:
            serverTimestamp(),
          seenByCoach: false,
          seenByParent: true
        }
      );

      await updateDoc(
        doc(
          db,
          THREAD_COLLECTION,
          athleteUid
        ),
        {
          lastBody:
            text.slice(0, 200),
          lastReplyAt:
            serverTimestamp(),
          updatedAt:
            serverTimestamp(),
          lastSender:
            "parent",
          lastReplyFrom:
            "parent",
          coachHasUnread: true,
          parentHasUnread: false,
          seenByCoach: false,
          seenByParent: true,
          archived: false,
          deleted: false,
          status: "open"
        }
      );

      if (replyInput) {
        replyInput.value = "";
      }

      showSuccess(
        "Reply sent."
      );
    } catch (error) {
      console.error(
        "[parent-thread] send failed:",
        error
      );

      showError(
        "Reply failed. Please try again."
      );
    } finally {
      if (!threadLocked) {
        if (replyInput) {
          replyInput.disabled =
            false;
        }

        if (replyBtn) {
          replyBtn.disabled =
            false;
        }
      }
    }
  }
);

/* =========================
   CLEANUP
========================= */

window.addEventListener(
  "beforeunload",
  () => {
    if (unsubscribeMessages) {
      try {
        unsubscribeMessages();
      } catch {}

      unsubscribeMessages = null;
    }
  }
);