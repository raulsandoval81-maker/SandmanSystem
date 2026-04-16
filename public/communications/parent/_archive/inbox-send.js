// public/communications/parent/inbox-send.js
// Option A: Unified thread model (compose-first -> thread)

import {
  db,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  ensureSignedIn
} from "/assets/js/firebase-init-para.js";

console.log("[inbox-send] loaded (unified threads)");

const btnSend = document.querySelector("#btn-send-inbox");
const nameEL  = document.querySelector("#inbox-parent-name");
const emailEL = document.querySelector("#inbox-parent-email");
const subjectEL = document.querySelector("#inbox-subject");
const bodyEL = document.querySelector("#inbox-body");

const successMsg = document.querySelector("#inbox-success");
const errMsg = document.querySelector("#inbox-error");

// Unified parent threads root (must match inbox-view.js)
const ROOT_COLLECTION = "paraParentInbox";

// -------- OPTIONAL: identity + targeting anchors (V1 safe) --------
function readTeamId() {
  return (
    window.PARA_TEAM_ID ||
    localStorage.getItem("paraTeamId") ||
    localStorage.getItem("teamId") ||
    ""
  ).toString().trim() || null;
}

function readTeamName() {
  return (
    window.PARA_TEAM_NAME ||
    localStorage.getItem("paraTeamName") ||
    localStorage.getItem("teamName") ||
    ""
  ).toString().trim() || null;
}

// V1 anchor for "one thread per parent" (upgrade later to parentUid/hashed email)
function readParentKeyFromEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return e || null;
}

// Guard loud
if (!btnSend || !nameEL || !bodyEL || !successMsg || !errMsg) {
  console.error("[inbox-send] Missing required DOM elements:", {
    btnSend: !!btnSend,
    nameEL: !!nameEL,
    emailEL: !!emailEL,
    subjectEL: !!subjectEL,
    bodyEL: !!bodyEL,
    successMsg: !!successMsg,
    errMsg: !!errMsg
  });
}

async function findExistingThreadId({ parentKey }) {
  if (!parentKey) return null;

  // One-thread-per-parent rule: find newest thread for that parentKey (not deleted)
  const colRef = collection(db, ROOT_COLLECTION);
  const q = query(
    colRef,
    where("parentKey", "==", parentKey),
    where("deleted", "==", false),
    orderBy("lastReplyAt", "desc"),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id;
}

btnSend?.addEventListener("click", async () => {
  try {
    await ensureSignedIn();
  } catch (e) {
    console.error("[inbox-send] ensureSignedIn failed:", e);
    errMsg.style.display = "block";
    successMsg.style.display = "none";
    return;
  }

  const name = (nameEL?.value || "").trim();
  const emailRaw = (emailEL?.value || "").trim();
  const email = emailRaw ? emailRaw.toLowerCase() : "";
  const subject = (subjectEL?.value || "").trim() || "(no subject)";
  const body = (bodyEL?.value || "").trim();

  if (!name || !body) {
    errMsg.style.display = "block";
    successMsg.style.display = "none";
    return;
  }

  errMsg.style.display = "none";

  const teamId = readTeamId();
  const teamName = readTeamName();
  const parentKey = readParentKeyFromEmail(email);

  try {
    // 1) Reuse existing thread if possible (prevents duplicates)
    let threadId = await findExistingThreadId({ parentKey });

    // 2) If none exists, create a new thread root doc
    if (!threadId) {
      const threadRootRef = await addDoc(collection(db, ROOT_COLLECTION), {
        // identity
        parentName: name,
        parentEmail: email || null,
        parentKey: parentKey || null,

        // optional targeting
        teamId: teamId || null,
        teamName: teamName || null,

        // summary fields for inbox list
        subject,
        lastBody: body,
        lastReplyAt: serverTimestamp(),

        // receipts/flags (V1)
        seenByParent: true,   // parent just sent it
        seenByCoach: false,   // coach hasn't read it yet

        // moderation
        archived: false,
        deleted: false,

        createdAt: serverTimestamp()
      });

      threadId = threadRootRef.id;
    } else {
      // If thread exists, we still want subject/preview to reflect latest message.
      // (We are NOT updating the root doc here because we’re staying minimal and you didn’t paste update helpers.
      // Your thread reader can still show messages; the inbox preview may lag until you add a lightweight update.)
    }

    // 3) Add message into thread subcollection
    await addDoc(collection(db, `${ROOT_COLLECTION}/${threadId}/thread`), {
      from: "parent",
      fromName: name,
      body,
      createdAt: serverTimestamp()
    });

    successMsg.style.display = "block";

    // 4) Redirect to the unified thread reader
    setTimeout(() => {
      window.location.href = `/communications/parent/thread.html?id=${encodeURIComponent(threadId)}`;
    }, 400);

  } catch (err) {
    console.error("[inbox-send] unified send error:", err);
    errMsg.style.display = "block";
    successMsg.style.display = "none";
  }
});