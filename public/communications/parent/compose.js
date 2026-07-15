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
  auth,
  ensureSignedIn,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  collection,
  addDoc,
  serverTimestamp,
  orderBy,
  limit
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

/* =========================
   CONFIG
========================= */

const THREAD_COLLECTION =
  "paraThreads";

const THREAD_LIMIT = 12;

const THREAD_LIMIT_MESSAGE =
  "This conversation has reached its text limit (12). Please schedule a call or meet with the coach in person.";

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

async function readAthlete(
  athleteUid
) {
  if (!athleteUid) {
    return null;
  }

  const athleteRef =
    doc(
      db,
      "athletes",
      athleteUid
    );

  const athleteSnap =
    await getDoc(athleteRef);

  if (!athleteSnap.exists()) {
    return null;
  }

  return {
    athleteUid,
    ...(athleteSnap.data() || {})
  };
}

async function resolveAthleteForParent(
  parentUid,
  requestedAthleteUid
) {
  /*
    Prefer an exact parent-athlete link when
    the URL specifies an athlete.
  */
  if (requestedAthleteUid) {
    const exactLinkQuery =
      query(
        collection(
          db,
          "parentAthleteLinks"
        ),
        where(
          "parentUid",
          "==",
          parentUid
        ),
        where(
          "athleteUid",
          "==",
          requestedAthleteUid
        )
      );

    const exactLinkSnap =
      await getDocs(
        exactLinkQuery
      );

    if (!exactLinkSnap.empty) {
      const linkData =
        exactLinkSnap.docs[0]
          .data() || {};

      const athlete =
        await readAthlete(
          requestedAthleteUid
        );

      return {
        ...athlete,
        ...linkData,
        athleteUid:
          requestedAthleteUid
      };
    }
  }

  /*
    If no athlete was requested, use the first
    valid linked athlete.
  */
  const linksQuery =
    query(
      collection(
        db,
        "parentAthleteLinks"
      ),
      where(
        "parentUid",
        "==",
        parentUid
      )
    );

  const linksSnap =
    await getDocs(linksQuery);

  if (!linksSnap.empty) {
    const linkData =
      linksSnap.docs[0]
        .data() || {};

    const linkedAthleteUid =
      String(
        linkData.athleteUid || ""
      )
        .trim()
        .toUpperCase();

    const athlete =
      await readAthlete(
        linkedAthleteUid
      );

    return {
      ...athlete,
      ...linkData,
      athleteUid:
        linkedAthleteUid
    };
  }

  /*
    Legacy athlete document fallback.
  */
  if (requestedAthleteUid) {
    const athlete =
      await readAthlete(
        requestedAthleteUid
      );

    if (
      athlete &&
      String(
        athlete.parentUid || ""
      ) === String(parentUid)
    ) {
      return athlete;
    }
  }

  return null;
}

function getAthleteName(
  athlete = {}
) {
  return String(
    athlete.athleteName ||
    athlete.publicName ||
    athlete.fullName ||
    athlete.name ||
    athlete.displayName ||
    athlete.athleteUid ||
    ""
  ).trim();
}

function getAthleteDiscipline(
  athlete = {}
) {
  return normalizeDiscipline(
    athlete.activeDiscipline ||
    athlete.primaryDiscipline ||
    athlete.discipline ||
    athlete.sport ||
    athlete.art ||
    athlete.programInterest ||
    ""
  );
}

/* =========================
   MESSAGE LIMIT
========================= */

async function getThreadMessageCount(
  athleteUid
) {
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
        "desc"
      ),
      limit(
        THREAD_LIMIT + 1
      )
    );

  const snapshot =
    await getDocs(
      messagesQuery
    );

  return snapshot.size;
}

async function enforceMessageLimit(
  athleteUid
) {
  const count =
    await getThreadMessageCount(
      athleteUid
    );

  if (count >= THREAD_LIMIT) {
    lockConversation();
    return false;
  }

  return true;
}

/* =========================
   BOOT
========================= */

const currentUid =
  auth.currentUser?.uid || null;

if (!currentUid) {
  showError(
    true,
    "You must be signed in."
  );

  throw new Error(
    "[compose] Missing currentUid"
  );
}

const requestedAthleteUid =
  getAthleteIdFromUrl();

resolvedAthlete =
  await resolveAthleteForParent(
    currentUid,
    requestedAthleteUid
  );

if (
  !resolvedAthlete?.athleteUid
) {
  showError(
    true,
    "No athlete linked to this parent account."
  );

  throw new Error(
    "[compose] No linked athlete"
  );
}

const athleteUid =
  String(
    resolvedAthlete.athleteUid || ""
  )
    .trim()
    .toUpperCase();

const athleteName =
  getAthleteName(
    resolvedAthlete
  );

const discipline =
  getAthleteDiscipline(
    resolvedAthlete
  );

if (!athleteUid) {
  showError(
    true,
    "Could not resolve athlete thread."
  );

  throw new Error(
    "[compose] Missing athleteUid"
  );
}

/* =========================
   PREFILL
========================= */

if (
  nameEl &&
  !nameEl.value.trim()
) {
  nameEl.value =
    auth.currentUser
      ?.displayName || "";
}

if (
  emailEl &&
  !emailEl.value.trim()
) {
  emailEl.value =
    auth.currentUser
      ?.email || "";
}

if (athleteLabelEl) {
  athleteLabelEl.textContent =
    athleteName || athleteUid;
}

if (disciplineLabelEl) {
  disciplineLabelEl.textContent =
    disciplineLabel(discipline);
}

/*
  Lock immediately if the existing thread has
  already reached the shared 12-message limit.
*/
try {
  await enforceMessageLimit(
    athleteUid
  );
} catch (error) {
  console.error(
    "[compose] message count check failed:",
    error
  );
}

/* =========================
   SEND
========================= */

btnSend?.addEventListener(
  "click",
  async () => {
    showSuccess(false);
    showError(false, "");

    if (threadLocked) {
      showError(
        true,
        THREAD_LIMIT_MESSAGE
      );

      return;
    }

    const parentName =
      String(
        nameEl?.value || ""
      ).trim() ||
      auth.currentUser
        ?.displayName ||
      "Parent";

    const parentEmail =
      String(
        emailEl?.value || ""
      ).trim() ||
      auth.currentUser
        ?.email ||
      "";

    const subject =
      String(
        subjectEl?.value || ""
      ).trim();

    const body =
      String(
        bodyEl?.value || ""
      ).trim();

    if (!parentEmail) {
      showError(
        true,
        "Parent email is required."
      );

      return;
    }

    if (!body) {
      showError(
        true,
        "Message body is required."
      );

      return;
    }

    if (btnSend?.disabled) {
      return;
    }

    setSendingState(true);

    try {
      /*
        Recheck immediately before writing so the
        parent and coach cannot cross the limit by
        sending at nearly the same time.
      */
      const maySend =
        await enforceMessageLimit(
          athleteUid
        );

      if (!maySend) {
        return;
      }

      const threadRef =
        doc(
          db,
          THREAD_COLLECTION,
          athleteUid
        );

      const messagesCollection =
        collection(
          db,
          THREAD_COLLECTION,
          athleteUid,
          "messages"
        );

      const existingThreadSnap =
        await getDoc(threadRef);

      const threadPayload = {
        athleteUid,
        athleteName,

        parentUid:
          currentUid,

        parentEmail,
        parentName,

        discipline,
        primaryDiscipline:
          discipline,

        updatedAt:
          serverTimestamp(),

        lastBody:
          body.slice(0, 200),

        lastReplyAt:
          serverTimestamp(),

        lastReplyFrom:
          "parent",

        lastSender:
          "parent",

        coachHasUnread:
          true,

        parentHasUnread:
          false,

        seenByCoach:
          false,

        seenByParent:
          true,

        archived:
          false,

        deleted:
          false,

        status:
          "open"
      };

      if (subject) {
        threadPayload.subject =
          subject;
      }

      if (
        !existingThreadSnap.exists()
      ) {
        threadPayload.createdAt =
          serverTimestamp();
      }

      await setDoc(
        threadRef,
        threadPayload,
        {
          merge: true
        }
      );

      await addDoc(
        messagesCollection,
        {
          body,
          subject:
            subject || null,

          from:
            "parent",

          fromUid:
            currentUid,

          fromName:
            parentName,

          parentEmail,

          athleteUid,
          discipline,

          createdAt:
            serverTimestamp(),

          seenByCoach:
            false,

          seenByParent:
            true
        }
      );

      showSuccess(
        true,
        "Message sent."
      );

      if (bodyEl) {
        bodyEl.value = "";
      }

      window.setTimeout(
        () => {
          window.location.href =
            `/communications/parent/thread.html?id=${escQS(athleteUid)}`;
        },
        300
      );
    } catch (error) {
      console.error(
        "[compose] send failed:",
        error
      );

      showError(
        true,
        "Send failed. Check console."
      );

      setSendingState(false);
      return;
    }

    setSendingState(false);
  }
);

/* =========================
   CANCEL
========================= */

btnCancel?.addEventListener(
  "click",
  () => {
    window.history.back();
  }
);