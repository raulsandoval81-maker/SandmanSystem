// public/para/-message-engine.js
// Core wiring for Para-Comms — used by BOTH parent + coach pages.

import {
  collection,
  doc,
  addDoc,
  setDoc,
  serverTimestamp,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function monthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Create / mirror a new parent-originated message.
 * scope: "family" (no athleteUid) OR "athlete" (with athleteUid)
 */
export async function sendParentMessage({
  db,
  authUid,
  athleteUid = null,
  familyName,
  text_en,
  text_es
}) {
  const key = monthKey();
  const scope = athleteUid ? "athlete" : "family";

  const basePayload = {
    authUid,
    athleteUid: athleteUid || null,
    familyName: familyName || "Family",
    scope,
    fromRole: "parent",
    lastSender: "parent",
    text_en: text_en || "",
    text_es: text_es || "",
    unreadForCoach: true,
    unreadForParent: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  // ------- 1) Write to COACH space (comms/...) -------
  let coachCol;
  if (scope === "family") {
    coachCol = collection(db, "comms", key, "family");
  } else {
    coachCol = collection(db, "comms", key, "athletes", athleteUid, "entries");
  }
  const coachRef = await addDoc(coachCol, basePayload);
  const entryId = coachRef.id;

  // ------- 2) Mirror to PARENT inbox (parentInbox/...) -------
  let parentDocRef;
  if (scope === "family") {
    parentDocRef = doc(db, "parentInbox", authUid, key, "family", entryId);
  } else {
    parentDocRef = doc(
      db,
      "parentInbox",
      authUid,
      key,
      "athletes",
      athleteUid,
      "entries",
      entryId
    );
  }

  await setDoc(parentDocRef, {
    ...basePayload,
    entryId,
    mirroredFrom: coachRef.path
  });

  return { entryId, coachPath: coachRef.path };
}

/**
 * Coach reply — writes to both master + parent mirror and flips unread flags.
 */
export async function sendCoachReply({
  db,
  entryMeta,   // { scope, key, authUid, athleteUid, entryId, familyName }
  text_en,
  text_es
}) {
  const {
    scope,
    key,
    authUid,
    athleteUid = null,
    entryId,
    familyName
  } = entryMeta;

  const replyPayload = {
    sender: "coach",
    text_en: text_en || "",
    text_es: text_es || "",
    createdAt: serverTimestamp()
  };

  // ----- 1) COACH thread path -----
  let coachEntryRef;
  if (scope === "family") {
    coachEntryRef = doc(db, "comms", key, "family", entryId);
  } else {
    coachEntryRef = doc(
      db,
      "comms",
      key,
      "athletes",
      athleteUid,
      "entries",
      entryId
    );
  }
  const coachThreadCol = collection(coachEntryRef, "thread");
  await addDoc(coachThreadCol, replyPayload);

  // flip flags for coach master
  await setDoc(
    coachEntryRef,
    {
      lastSender: "coach",
      unreadForParent: true,
      unreadForCoach: false,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  // ----- 2) PARENT thread mirror -----
  let parentEntryRef;
  if (scope === "family") {
    parentEntryRef = doc(
      db,
      "parentInbox",
      authUid,
      key,
      "family",
      entryId
    );
  } else {
    parentEntryRef = doc(
      db,
      "parentInbox",
      authUid,
      key,
      "athletes",
      athleteUid,
      "entries",
      entryId
    );
  }
  const parentThreadCol = collection(parentEntryRef, "thread");
  await addDoc(parentThreadCol, replyPayload);

  await setDoc(
    parentEntryRef,
    {
      lastSender: "coach",
      unreadForParent: true,
      unreadForCoach: false,
      familyName: familyName || "Family",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

/**
 * Mark a message as seen on PARENT side.
 */
export async function markParentSeen({ db, authUid, scope, key, athleteUid, entryId }) {
  let ref;
  if (scope === "family") {
    ref = doc(db, "parentInbox", authUid, key, "family", entryId);
  } else {
    ref = doc(
      db,
      "parentInbox",
      authUid,
      key,
      "athletes",
      athleteUid,
      "entries",
      entryId
    );
  }
  await setDoc(
    ref,
    {
      unreadForParent: false,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

/**
 * Mark a message as seen on COACH side.
 */
export async function markCoachSeen({ db, scope, key, athleteUid, entryId }) {
  let ref;
  if (scope === "family") {
    ref = doc(db, "comms", key, "family", entryId);
  } else {
    ref = doc(
      db,
      "comms",
      key,
      "athletes",
      athleteUid,
      "entries",
      entryId
    );
  }
  await setDoc(
    ref,
    {
      unreadForCoach: false,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
