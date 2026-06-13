import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  getFirestore,
} from "firebase-admin/firestore";

export const getMyAthlete = onCall(async (req) => {
  const db = getFirestore();

  const parentUid =
    req.auth?.uid || "";

  if (!parentUid) {
    throw new HttpsError(
      "unauthenticated",
      "Parent must be signed in."
    );
  }

  const linkSnap = await db
    .collection("parentAthleteLinks")
    .where("parentUid", "==", parentUid)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (linkSnap.empty) {
    return {
      ok: true,
      linked: false,
      athlete: null,
      parentUid,
    };
  }

  const link =
    linkSnap.docs[0].data() || {};

  const athleteUid =
    String(link.athleteUid || "").trim();

  if (!athleteUid) {
    throw new HttpsError(
      "failed-precondition",
      "Parent link is missing athleteUid."
    );
  }

  const athleteRef =
    db.collection("athletes").doc(athleteUid);

  const athleteSnap =
    await athleteRef.get();

  if (!athleteSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Linked athlete not found."
    );
  }

  const athlete =
    athleteSnap.data() || {};

  return {
    ok: true,
    linked: true,
    parentUid,
    athleteId: athleteSnap.id,
    athlete: {
      id: athleteSnap.id,
      ...athlete,
    },
  };
});