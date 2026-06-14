import {
  onCall,
  HttpsError
} from "firebase-functions/v2/https";

import {
  getFirestore,
  FieldValue
} from "firebase-admin/firestore";

import {
  sendParentSignal
} from "./sendParentSignal";

import {
  PARENT_SIGNAL_TYPES
} from "./parentSignalTypes";

export const saveCoachNote = onCall(async (req) => {
  const db = getFirestore();

  const uid =
    String(req.data?.uid || "").trim();

  const note =
    String(req.data?.note || "").trim();

  const coachName =
    String(req.data?.coachName || "Coach").trim();

  if (!uid) {
    throw new HttpsError(
      "invalid-argument",
      "Missing uid"
    );
  }

  if (!note) {
    throw new HttpsError(
      "invalid-argument",
      "Missing note"
    );
  }

  if (note.length > 500) {
    throw new HttpsError(
      "invalid-argument",
      "Coach note is too long"
    );
  }

  const athleteRef =
    db.collection("athletes").doc(uid);

  const snap =
    await athleteRef.get();

  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      "Athlete not found"
    );
  }

  const athlete =
    snap.data() || {};

const linkSnap = await db
  .collection("parentAthleteLinks")
  .where("athleteUid", "==", uid)
  .where("status", "==", "active")
  .limit(1)
  .get();

const parentUid =
  linkSnap.empty
    ? athlete.parentUid || null
    : String(linkSnap.docs[0].data()?.parentUid || "").trim();

  const athleteName =
    athlete.publicName ||
    athlete.fullName ||
    null;

  const noteRef =
    db.collection("coachNotes").doc();

  await noteRef.set({
    uid,
    athleteId: uid,
    athleteName,
    parentUid,

    note,
    coachName,

    createdAt:
      FieldValue.serverTimestamp(),

    source: "coach",
    visibleToParent: true,
  });

  await athleteRef.set(
    {
      latestCoachNote: {
        note,
        coachName,
        noteId: noteRef.id,
        createdAt:
          FieldValue.serverTimestamp(),
      },
      updatedAt:
        FieldValue.serverTimestamp(),
    },
    {
      merge: true,
    }
  );

  if (parentUid) {
    await sendParentSignal({
      parentUid,
      athleteId: uid,
      athleteName,

      type: PARENT_SIGNAL_TYPES.COACH_NOTE,

      note,

      source: "saveCoachNote",
      sourceId: noteRef.id,
    });
  }

  return {
    ok: true,
    uid,
    noteId: noteRef.id,
    parentNotified: !!parentUid,
  };
});