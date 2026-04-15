// ----------------------------------------------------------
// /para/parent/compose.js
// Parent Compose → Athlete-Centered Thread
//
// Thread root:   paraThreads/{athleteUid}
// Messages:      paraThreads/{athleteUid}/messages/{messageId}
//
// Rules:
// - one thread per athlete
// - athleteUid is the thread id
// - parent must be linked to athlete
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
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const THREAD_COLLECTION = "paraThreads";

// DOM
const nameEl = document.getElementById("pc-name");
const emailEl = document.getElementById("pc-email");
const subjectEl = document.getElementById("pc-subject");
const bodyEl = document.getElementById("pc-body");

const btnSend = document.getElementById("pc-send");
const btnCancel = document.getElementById("pc-cancel");

const okMsg = document.getElementById("pc-success");
const errMsg = document.getElementById("pc-error");

// ------------------------------------------------
// helpers
// ------------------------------------------------
function showSuccess(show = true) {
  if (okMsg) okMsg.style.display = show ? "block" : "none";
}

function showError(show = true, message = "") {
  if (!errMsg) return;
  if (message) errMsg.textContent = message;
  errMsg.style.display = show ? "block" : "none";
}

function escQS(s) {
  return encodeURIComponent(String(s || ""));
}

function setSendingState(isSending) {
  if (btnSend) {
    btnSend.disabled = isSending;
    btnSend.textContent = isSending ? "Sending…" : "Send";
  }
  if (btnCancel) btnCancel.disabled = isSending;
  if (bodyEl) bodyEl.disabled = isSending;
  if (subjectEl) subjectEl.disabled = isSending;
  if (nameEl) nameEl.disabled = isSending;
  if (emailEl) emailEl.disabled = isSending;
}

function getAthleteIdFromUrl() {
  const p = new URLSearchParams(location.search);
  return String(p.get("athleteUid") || p.get("id") || "").trim();
}

async function resolveAthleteForParent(parentUid, requestedAthleteUid) {
  // links first
  if (requestedAthleteUid) {
    const exactLinkQ = query(
      collection(db, "parentAthleteLinks"),
      where("parentUid", "==", parentUid),
      where("athleteUid", "==", requestedAthleteUid)
    );
    const exactLinkSnap = await getDocs(exactLinkQ);
    if (!exactLinkSnap.empty) {
      return exactLinkSnap.docs[0].data();
    }
  }

  const linksQ = query(
    collection(db, "parentAthleteLinks"),
    where("parentUid", "==", parentUid)
  );
  const linksSnap = await getDocs(linksQ);
  if (!linksSnap.empty) {
    return linksSnap.docs[0].data();
  }

  // legacy fallback
  if (requestedAthleteUid) {
    const athleteRef = doc(db, "athletes", requestedAthleteUid);
    const athleteSnap = await getDoc(athleteRef);
    if (athleteSnap.exists()) {
      const a = athleteSnap.data() || {};
      if (String(a.parentUid || "") === String(parentUid)) {
        return {
          athleteUid: requestedAthleteUid,
          athleteName: a.name || a.athleteName || ""
        };
      }
    }
  }

  return null;
}

// ------------------------------------------------
// boot
// ------------------------------------------------
const currentUid = auth.currentUser?.uid || null;

if (!currentUid) {
  showError(true, "You must be signed in.");
  throw new Error("[compose] Missing currentUid");
}

const requestedAthleteUid = getAthleteIdFromUrl();
const link = await resolveAthleteForParent(currentUid, requestedAthleteUid);

if (!link?.athleteUid) {
  showError(true, "No athlete linked to this parent account.");
  throw new Error("[compose] No linked athlete");
}

const athleteUid = String(link.athleteUid || "").trim();
const athleteName = String(link.athleteName || "").trim();

if (!athleteUid) {
  showError(true, "Could not resolve athlete thread.");
  throw new Error("[compose] Missing athleteUid");
}

// prefill parent identity
if (nameEl && !nameEl.value.trim()) {
  nameEl.value = auth.currentUser?.displayName || "";
}
if (emailEl && !emailEl.value.trim()) {
  emailEl.value = auth.currentUser?.email || "";
}

// ------------------------------------------------
// SEND
// ------------------------------------------------
btnSend?.addEventListener("click", async () => {
  showSuccess(false);
  showError(false, "");

  const parentName =
    (nameEl?.value || "").trim() ||
    auth.currentUser?.displayName ||
    "Parent";

  const parentEmail =
    (emailEl?.value || "").trim() ||
    auth.currentUser?.email ||
    "";

  const subject = (subjectEl?.value || "").trim();
  const body = (bodyEl?.value || "").trim();

  if (!parentEmail) {
    showError(true, "Parent email is required.");
    return;
  }

  if (!body) {
    showError(true, "Message body is required.");
    return;
  }

  if (btnSend?.disabled) return;
  setSendingState(true);

  try {
    const threadRef = doc(db, THREAD_COLLECTION, athleteUid);
    const messagesCol = collection(db, THREAD_COLLECTION, athleteUid, "messages");
    const existingThreadSnap = await getDoc(threadRef);

    // 1) Ensure thread root exists / update summary
    const threadPayload = {
      athleteUid,
      athleteName,
      parentUid: currentUid,
      parentEmail,
      parentName,
      updatedAt: serverTimestamp(),
      lastBody: body.slice(0, 200),
      lastReplyAt: serverTimestamp(),
      coachHasUnread: true,
      parentHasUnread: false,
      seenByCoach: false,
      seenByParent: true,
      status: "open"
    };

    if (subject) {
      threadPayload.subject = subject;
    }

    if (!existingThreadSnap.exists()) {
      threadPayload.createdAt = serverTimestamp();
    }

    await setDoc(threadRef, threadPayload, { merge: true });

    // 2) Add parent message
    await addDoc(messagesCol, {
      body,
      from: "parent",
      fromUid: currentUid,
      fromName: parentName,
      parentEmail,
      createdAt: serverTimestamp(),
      seenByCoach: false,
      seenByParent: true
    });

    showSuccess(true);

    if (bodyEl) bodyEl.value = "";

    setTimeout(() => {
      location.href = `/para/parent/thread.html?id=${escQS(athleteUid)}`;
    }, 300);
  } catch (e) {
    console.error("[compose] send failed:", e);
    showError(true, "Send failed. Check console.");
    setSendingState(false);
    return;
  }

  setSendingState(false);
});

// ------------------------------------------------
// CANCEL
// ------------------------------------------------
btnCancel?.addEventListener("click", () => {
  history.back();
});