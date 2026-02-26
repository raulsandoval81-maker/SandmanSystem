// ----------------------------------------------------------
// /coach/para/parent/compose.js
// Parent Compose → Unified Thread (Single Thread Per Parent)
//
// Root:   paraParentInbox/{threadId}
// Thread: paraParentInbox/{threadId}/thread/{messageId}
//
// V1 Rules:
// - ONE thread per parent
// - threadId = normalized email
// - Always redirect to thread.html?id={threadId}
// ----------------------------------------------------------

import {
  db,
  ensureSignedIn,
  doc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

const ROOT_COLLECTION = "paraParentInbox";

// DOM (your actual IDs)
const nameEl    = document.getElementById("pc-name");
const emailEl   = document.getElementById("pc-email");
const subjectEl = document.getElementById("pc-subject");
const bodyEl    = document.getElementById("pc-body");

const btnSend   = document.getElementById("pc-send");
const btnCancel = document.getElementById("pc-cancel");

const okMsg     = document.getElementById("pc-success");
const errMsg    = document.getElementById("pc-error");

// ------------------------------------------------
// helpers
// ------------------------------------------------
function parentKeyFromEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function showSuccess(show = true) {
  if (okMsg) okMsg.style.display = show ? "block" : "none";
}

function showError(show = true) {
  if (errMsg) errMsg.style.display = show ? "block" : "none";
}

function escQS(s) {
  return encodeURIComponent(String(s || ""));
}

async function safeMergeUpdate(ref, patch) {
  try {
    await updateDoc(ref, patch);
  } catch {
    await setDoc(ref, patch, { merge: true });
  }
}

// ------------------------------------------------
// SEND
// ------------------------------------------------
btnSend?.addEventListener("click", async () => {
  showSuccess(false);
  showError(false);

  const parentName  = (nameEl?.value || "").trim();
  const parentEmail = (emailEl?.value || "").trim();
  const subject     = (subjectEl?.value || "").trim();
  const body        = (bodyEl?.value || "").trim();

  if (!parentEmail) {
    showError(true);
    return;
  }

  if (!body) {
    showError(true);
    return;
  }

  const threadId = parentKeyFromEmail(parentEmail);

  btnSend.disabled = true;
  btnSend.textContent = "Sending…";

  try {
    const rootRef   = doc(db, ROOT_COLLECTION, threadId);
    const threadCol = collection(db, ROOT_COLLECTION, threadId, "thread");

    // 1️⃣ Ensure root exists (merge)
    await setDoc(
      rootRef,
      {
        parentKey: threadId,
        parentEmail: threadId,
        parentName: parentName || "Parent",
        ...(subject ? { subject } : {}),
        createdAt: serverTimestamp()
      },
      { merge: true }
    );

    // 2️⃣ Add message to thread
    await addDoc(threadCol, {
      from: "parent",
      fromName: parentName || "Parent",
      body,
      createdAt: serverTimestamp(),
      seenByCoach: false,
      seenByParent: true
    });

    // 3️⃣ Update root summary + flags
    await safeMergeUpdate(rootRef, {
      lastBody: body.slice(0, 200),
      lastReplyAt: serverTimestamp(),
      coachHasUnread: true,
      parentHasUnread: false,
      seenByParent: true,
      seenByCoach: false
    });

    showSuccess(true);

    // 4️⃣ Redirect to thread (CRITICAL — includes id)
    setTimeout(() => {
      location.href = `/coach/para/parent/thread.html?id=${escQS(threadId)}`;
    }, 600);

  } catch (e) {
    console.error("[compose] send failed:", e);
    showError(true);
    btnSend.disabled = false;
    btnSend.textContent = "Send";
  }
});

// ------------------------------------------------
// CANCEL
// ------------------------------------------------
btnCancel?.addEventListener("click", () => {
  history.back();
});