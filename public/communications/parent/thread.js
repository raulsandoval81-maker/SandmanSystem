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
// - hard conversation limit: 6 total messages
// ------------------------------------------------------------

import {
  db,
  auth,
  httpsCallable,
  functions,
  ensureSignedIn,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  orderBy,
  limit,
  addDoc,
  serverTimestamp,
  onSnapshot
} from "/assets/js/firebase-init-para.js";

function logPermissionFailure(stage, error) {
  console.error(`[parent-thread] ${stage} failed:`, error);

  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (
    code.includes("permission-denied") ||
    message.toLowerCase().includes("insufficient permissions")
  ) {
    console.error(
      `[parent-thread] PERMISSION TARGET: ${stage}`
    );
  }
}



await ensureSignedIn();

/* =========================
   CONFIG
========================= */

const THREAD_COLLECTION =
  "paraThreads";

const getMyAthleteCall =
  httpsCallable(
    functions,
    "getMyAthlete"
  );

const DEFAULT_THREAD_LIMIT = 6;

const closeThreadBtn =
  document.getElementById(
    "thread-close"
  );

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
  window.location.replace(
    "/communications/parent/compose.html"
  );

  throw new Error(
    "[parent-thread] Missing athleteUid — redirecting to compose."
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
let activeConversationId = "";

let academySettings = {
  academyId: "sandman-main",
  academyName: "Sandman Academy Of Combat",
  communicationEmail: "contactsandmancombat@gmail.com",
  replyToEmail: "contactsandmancombat@gmail.com",
  phone: "",
  messageLimit: DEFAULT_THREAD_LIMIT,
  allowNewConversationAfterClose: true,
  autoCloseAtLimit: true
};
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

async function authorizeParent() {
  const result =
    await getMyAthleteCall({});

  const data =
    result?.data || {};

  if (
    data.ok !== true ||
    data.linked !== true
  ) {
    throw new Error(
      "No athlete is linked to this parent account."
    );
  }

  const athletes =
    Array.isArray(data.athletes)
      ? data.athletes
      : [];

  const candidates = [
    ...athletes,
    ...(data.athlete
      ? [data.athlete]
      : [])
  ];

  const authorized =
    candidates.some((athlete) => {
      const uid =
        String(
          athlete.athleteUid ||
          athlete.id ||
          athlete.uid ||
          ""
        )
          .trim()
          .toUpperCase();

      return uid === athleteUid;
    });

  if (!authorized) {
    throw new Error(
      "This parent account is not linked to the athlete."
    );
  }
}


/* =========================
   ACADEMY SETTINGS
========================= */

function getThreadLimit() {
  const parsed =
    Number(
      academySettings.messageLimit ||
      DEFAULT_THREAD_LIMIT
    );

  if (!Number.isFinite(parsed)) {
    return DEFAULT_THREAD_LIMIT;
  }

  return Math.max(
    1,
    Math.min(20, Math.trunc(parsed))
  );
}

function getCommunicationEmail() {
  return String(
    academySettings.communicationEmail ||
    academySettings.replyToEmail ||
    ""
  ).trim();
}

function getLimitMessage() {
  const limit =
    getThreadLimit();

  const email =
    getCommunicationEmail();

  const isSpanish =
    document.documentElement.lang === "es";

  if (email) {
    return isSpanish
      ? `Esta conversación alcanzó el límite de ${limit} mensajes en la aplicación. Continúe por correo electrónico a ${email}.`
      : `This conversation has reached the ${limit}-message app limit. Please continue by email at ${email}.`;
  }

  return isSpanish
    ? `Esta conversación alcanzó el límite de ${limit} mensajes en la aplicación. Continúe por correo electrónico.`
    : `This conversation has reached the ${limit}-message app limit. Please continue by email.`;
}

async function loadAcademySettings(
  academyId = "sandman-main"
) {
  const normalizedAcademyId =
    String(
      academyId ||
      "sandman-main"
    )
      .trim()
      .toLowerCase();

  try {
    const settingsSnap =
      await getDoc(
        doc(
          db,
          "academySettings",
          normalizedAcademyId
        )
      );

    if (!settingsSnap.exists()) {
      console.warn(
        "[parent-thread] academy settings not found:",
        normalizedAcademyId
      );

      return academySettings;
    }

    academySettings = {
      ...academySettings,
      academyId:
        normalizedAcademyId,
      ...(settingsSnap.data() || {})
    };

    console.log(
      "[parent-thread] academy settings loaded:",
      academySettings
    );

    return academySettings;
  } catch (error) {
    console.warn(
      "[parent-thread] academy settings load failed:",
      error
    );

    return academySettings;
  }
}

function paintPolicyNote() {
  const note =
    document.getElementById(
      "thread-policy-note"
    );

  if (!note) return;

  const limit =
    getThreadLimit();

  const email =
    getCommunicationEmail();

  const isSpanish =
    document.documentElement.lang === "es";

  note.textContent = "";

  const text =
    isSpanish
      ? `Esta conversación está limitada a ${limit} mensajes en la aplicación.`
      : `This conversation is limited to ${limit} messages in the app.`;

  note.appendChild(
    document.createTextNode(text)
  );

  if (!email) {
    const fallback =
      isSpanish
        ? " Después del límite, continúe por correo electrónico."
        : " After the limit, continue by email.";

    note.appendChild(
      document.createTextNode(fallback)
    );

    return;
  }

  const continuation =
    isSpanish
      ? " Después del límite, continúe por correo electrónico a "
      : " After the limit, continue by email at ";

  note.appendChild(
    document.createTextNode(
      continuation
    )
  );

  const link =
    document.createElement("a");

  link.href =
    `mailto:${email}`;

  link.textContent =
    email;

  note.appendChild(link);
  note.appendChild(
    document.createTextNode(".")
  );
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

  banner.textContent = "";

  const limitMessage =
    getLimitMessage();

  const email =
    getCommunicationEmail();

  if (
    email &&
    limitMessage.includes(email)
  ) {
    const parts =
      limitMessage.split(email);

    banner.appendChild(
      document.createTextNode(
        parts[0]
      )
    );

    const emailLink =
      document.createElement("a");

    emailLink.href =
      `mailto:${email}`;

    emailLink.textContent =
      email;

    emailLink.style.color =
      "#ffdd48";

    emailLink.style.fontWeight =
      "900";

    emailLink.style.textDecoration =
      "underline";

    banner.appendChild(
      emailLink
    );

    banner.appendChild(
      document.createTextNode(
        parts.slice(1).join(email)
      )
    );
  } else {
    banner.textContent =
      limitMessage;
  }

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
    getThreadLimit();

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
    isCoach
      ? "Coach"
      : "You";

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
    new Intl.DateTimeFormat(
      document.documentElement.lang === "es"
        ? "es-US"
        : "en-US",
      {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }
    ).format(date);

  if (
    isCoach &&
    message.seenByParent === true
  ) {
    stamp.textContent +=
      document.documentElement.lang === "es"
        ? " · Visto"
        : " · Seen";
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
    await getDoc(threadRef).catch((error) => {
      logPermissionFailure("thread root read", error);
      throw error;
    });

  if (!threadSnap.exists()) {
    threadEl.innerHTML =
      `<p>Thread not found.</p>`;

    return null;
  }

  const root =
    threadSnap.data() || {};

  threadRoot = root;

  await loadAcademySettings(
    root.academyId ||
    "sandman-main"
  );

  paintPolicyNote();

activeConversationId =
  String(
    root.activeConversationId || ""
  ).trim();

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
        getThreadLimit() + 1
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
          .slice(0, getThreadLimit())
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
async function closeConversation() {
  if (!threadRoot) return;

  const confirmed =
    window.confirm(
      document.documentElement.lang === "es"
        ? "¿Finalizar esta conversación? Podrá iniciar una nueva conversación después."
        : "End this conversation? You can start a new conversation afterward."
    );

  if (!confirmed) return;

  if (closeThreadBtn) {
    closeThreadBtn.disabled = true;
  }

  try {
    await updateDoc(
      doc(
        db,
        THREAD_COLLECTION,
        athleteUid
      ),
      {
        status: "closed",
        closedAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp(),
        parentHasUnread: false,
        coachHasUnread: false
      }
    );

    threadLocked = true;

    if (replyPanel) {
      replyPanel.hidden = true;
    }

    window.location.assign(
      "/parent/messages/index.html"
    );
  } catch (error) {
    console.error(
      "[parent-thread] close failed:",
      error
    );

    showError(
      document.documentElement.lang === "es"
        ? "No se pudo finalizar la conversación."
        : "Unable to end the conversation."
    );

    if (closeThreadBtn) {
      closeThreadBtn.disabled = false;
    }
  }
}

closeThreadBtn?.addEventListener(
  "click",
  closeConversation
);
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
        getThreadLimit()
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
            getThreadLimit()
          )
        );

      const countSnapshot =
        await getDocs(
          countQuery
        );

      if (
        countSnapshot.size >=
        getThreadLimit()
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

          conversationId:
  activeConversationId,
  
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
          messageCount:
            currentMessageCount + 1,

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