// ----------------------------------------------------------
// /communications/parent/compose.js
// Parent Compose → Athlete-Centered Thread
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
// - athlete discipline is preserved on the thread root
// - conversation is capped at 12 total messages
// - redirect to thread.html?id={athleteUid}
// ----------------------------------------------------------

import {
  db,
  functions,
  httpsCallable,
  ensureSignedIn,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc
} from "/assets/js/firebase-init-para.js";

const currentUser = await ensureSignedIn();

const getMyAthleteCall =
  httpsCallable(functions, "getMyAthlete");


/* =========================
   CONFIG
========================= */

const THREAD_COLLECTION =
  "paraThreads";

const THREAD_LIMIT = 6;

const THREAD_LIMIT_MESSAGE =
  "This conversation has reached the 6-message app limit. Please continue by email.";
/* =========================
   DOM
========================= */

const nameEl =
  document.getElementById("pc-name");

const emailEl =
  document.getElementById("pc-email");

const subjectEl =
  document.getElementById("pc-subject");

const bodyEl =
  document.getElementById("pc-body");

const btnSend =
  document.getElementById("pc-send");

const btnCancel =
  document.getElementById("pc-cancel");

const okMsg =
  document.getElementById("pc-success");

const errMsg =
  document.getElementById("pc-error");

const athleteLabelEl =
  document.getElementById("pc-athlete");

const disciplineLabelEl =
  document.getElementById(
    "pc-discipline-label"
  );

/* =========================
   STATE
========================= */

let resolvedAthlete = null;
let threadLocked = false;

/* =========================
   UI HELPERS
========================= */

function showSuccess(
  show = true,
  message = ""
) {
  if (!okMsg) return;

  if (message) {
    okMsg.textContent = message;
  }

  okMsg.style.display =
    show ? "block" : "none";
}

function showError(
  show = true,
  message = ""
) {
  if (!errMsg) return;

  if (message) {
    errMsg.textContent = message;
  }

  errMsg.style.display =
    show ? "block" : "none";
}

function escQS(value = "") {
  return encodeURIComponent(
    String(value || "")
  );
}

function setSendingState(
  isSending
) {
  if (btnSend) {
    btnSend.disabled =
      isSending || threadLocked;

    btnSend.textContent =
      isSending
        ? "Sending…"
        : threadLocked
          ? "Conversation Closed"
          : "Send";
  }

  if (btnCancel) {
    btnCancel.disabled =
      isSending;
  }

  if (bodyEl) {
    bodyEl.disabled =
      isSending || threadLocked;
  }

  if (subjectEl) {
    subjectEl.disabled =
      isSending || threadLocked;
  }

  if (nameEl) {
    nameEl.disabled =
      isSending;
  }

  if (emailEl) {
    emailEl.disabled =
      isSending;
  }
}

function lockConversation() {
  threadLocked = true;

  setSendingState(false);

  showError(
    true,
    THREAD_LIMIT_MESSAGE
  );
}

/* =========================
   NORMALIZATION
========================= */

function normalizeDiscipline(
  value = ""
) {
  const raw = String(value || "")
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

  if (!normalized) {
    return "General";
  }

  return normalized
    .split("-")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

/* =========================
   URL
========================= */

function getAthleteIdFromUrl() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return String(
    params.get("athleteUid") ||
    params.get("id") ||
    ""
  )
    .trim()
    .toUpperCase();
}

/* =========================
   ATHLETE RESOLUTION
========================= */


async function resolveAthleteForParent(
  requestedAthleteUid = ""
) {
  const result =
    await getMyAthleteCall({});

  const data =
    result?.data || {};

  if (
    data.ok !== true ||
    data.linked !== true
  ) {
    return null;
  }

  const athletes =
    Array.isArray(data.athletes)
      ? data.athletes
      : [];

  const requested =
    String(requestedAthleteUid || "")
      .trim()
      .toUpperCase();

  let athlete = null;

  if (requested) {
    athlete = athletes.find(a => {
      const uid = String(
        a.athleteUid ||
        a.id ||
        a.uid ||
        ""
      )
      .trim()
      .toUpperCase();

      return uid === requested;
    });
  }

if (requested && !athlete) {
  console.error(
    "[parent-compose] Unauthorized athlete requested:",
    requested
  );

  return null;
}

if (!requested) {
  athlete =
    data.athlete ||
    athletes[0] ||
    null;
}

  if (!athlete) {
    return null;
  }

  const athleteUid = String(
    athlete.athleteUid ||
    athlete.id ||
    athlete.uid ||
    ""
  )
  .trim()
  .toUpperCase();

  return {
    ...athlete,
    athleteUid
  };
}
/* =========================
   PAGE INITIALIZATION
========================= */

async function initializeCompose() {
  try {
    showError(false);
    showSuccess(false);
    setSendingState(true);

    const requestedAthleteUid =
      getAthleteIdFromUrl();

    const athlete =
      await resolveAthleteForParent(
        requestedAthleteUid
      );

    if (!athlete) {
      if (athleteLabelEl) {
        athleteLabelEl.textContent =
          "No authorized athlete";
      }

      if (disciplineLabelEl) {
        disciplineLabelEl.textContent =
          "Unavailable";
      }

      showError(
        true,
        "We could not verify an athlete linked to this parent account."
      );

      return;
    }

    resolvedAthlete = athlete;

    const athleteName =
      athlete.publicName ||
      athlete.fullName ||
      athlete.name ||
      athlete.athleteName ||
      athlete.athleteUid;

    const athleteDiscipline =
      athlete.primaryDiscipline ||
      athlete.discipline ||
      athlete.sport ||
      athlete.art ||
      "";

    if (athleteLabelEl) {
      athleteLabelEl.textContent =
        athleteName;
    }

    if (disciplineLabelEl) {
      disciplineLabelEl.textContent =
        disciplineLabel(
          athleteDiscipline
        );
    }

    setSendingState(false);

    console.log(
      "[parent-compose] athlete resolved:",
      resolvedAthlete
    );
  } catch (err) {
    console.error(
      "[parent-compose] initialization failed:",
      err
    );

    if (athleteLabelEl) {
      athleteLabelEl.textContent =
        "Unable to load";
    }

    if (disciplineLabelEl) {
      disciplineLabelEl.textContent =
        "Unavailable";
    }

    showError(
      true,
      "Unable to load your athlete information."
    );
  }
}

/* =========================
   SEND MESSAGE
========================= */

async function sendMessage() {
  try {
    showError(false);
    showSuccess(false);
    setSendingState(true);

    if (!resolvedAthlete) {
      throw new Error(
        "Your athlete could not be verified."
      );
    }

    const athleteUid = String(
      resolvedAthlete.athleteUid ||
      resolvedAthlete.id ||
      resolvedAthlete.uid ||
      ""
    )
      .trim()
      .toUpperCase();

    if (!athleteUid) {
      throw new Error(
        "Missing athlete identification."
      );
    }

    const parentName =
      String(nameEl?.value || "").trim();

    const parentEmail =
      String(emailEl?.value || "").trim();

    const subject =
      String(subjectEl?.value || "").trim();

    const message =
      String(bodyEl?.value || "").trim();

    if (!parentName) {
      throw new Error(
        "Your name is required."
      );
    }

    if (!parentEmail) {
      throw new Error(
        "Your email is required."
      );
    }

    if (!message) {
      throw new Error(
        "Your message is required."
      );
    }

const threadRef =
  doc(
    db,
    THREAD_COLLECTION,
    athleteUid
  );

let existingThreadSnap;

try {
  existingThreadSnap =
    await getDoc(threadRef);
} catch (error) {
  console.error(
    "[parent-compose] THREAD ROOT READ failed:",
    error
  );

  throw error;
}

const existingThread =
  existingThreadSnap.exists()
    ? existingThreadSnap.data() || {}
    : {};

const currentCount =
  Number(existingThread.messageCount || 0);

if (currentCount >= THREAD_LIMIT) {
  lockConversation();

  throw new Error(
    THREAD_LIMIT_MESSAGE
  );
}

const discipline =
  normalizeDiscipline(
    resolvedAthlete.primaryDiscipline ||
    resolvedAthlete.discipline ||
    resolvedAthlete.sport ||
    resolvedAthlete.art ||
    ""
  );

const athleteName =
  resolvedAthlete.publicName ||
  resolvedAthlete.fullName ||
  resolvedAthlete.name ||
  resolvedAthlete.athleteName ||
  athleteUid;

const effectiveSubject =
  subject || "Coach Conversation";

const academyId =
  String(
    resolvedAthlete.academyId ||
    resolvedAthlete.organizationId ||
    resolvedAthlete.gymId ||
    resolvedAthlete.teamId ||
    "sandman-main"
  )
    .trim()
    .toLowerCase();

const nextCount =
  currentCount + 1;

  
try {
  await setDoc(
    threadRef,
    {
      athleteUid,
      athleteName,
      discipline,
      academyId,

      parentUid:
        currentUser?.uid || "",

      parentName,
      parentEmail,

      subject:
        existingThread.subject ||
        effectiveSubject,

      status: "open",
      deleted: false,

      messageCount:
        nextCount,

      lastBody:
        message,

      lastSenderRole:
        "parent",

      lastReplyAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp(),

      ...(
        existingThreadSnap.exists()
          ? {}
          : {
              createdAt:
                serverTimestamp()
            }
      )
    },
    {
      merge: true
    }
  );
} catch (error) {
  console.error(
    "[parent-compose] THREAD ROOT WRITE failed:",
    error
  );

  throw error;
}
/*
  Add the first/new parent message.
*/
try {
  await addDoc(
    collection(
      db,
      THREAD_COLLECTION,
      athleteUid,
      "messages"
    ),
    {
      athleteUid,

      from: "parent",

      fromUid:
        currentUser?.uid || "",

      fromName:
        parentName,

      parentEmail,

      subject:
        effectiveSubject,

      body:
        message,

      discipline,

      createdAt:
        serverTimestamp(),

      seenByCoach:
        false,

      seenByParent:
        true
    }
  );
} catch (error) {
  console.error(
    "[parent-compose] MESSAGE WRITE failed:",
    error
  );

  throw error;
}

showSuccess(
  true,
  "Message sent. Opening conversation…"
);

window.location.assign(
  `/communications/parent/thread.html?id=${encodeURIComponent(athleteUid)}`
);

} catch (err) {
  console.error(
    "[parent-compose] send failed:",
    err
  );

  showError(
    true,
    err?.message ||
    "Unable to send your message."
  );

  setSendingState(false);
}
}
/* =========================
   BUTTON EVENTS
========================= */

btnSend?.addEventListener(
  "click",
  sendMessage
);

btnCancel?.addEventListener(
  "click",
  () => {
    window.location.assign(
      "/parent/messages/index.html"
    );
  }
);

/* =========================
   BOOT
========================= */

initializeCompose();