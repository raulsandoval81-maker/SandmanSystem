import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";

export const linkParentToAthlete = onCall(async (req) => {
  const db = getFirestore();

  const athleteUid =
    String(req.data?.athleteUid || "").trim();

  const parentEmail =
    String(req.data?.parentEmail || "")
      .trim()
      .toLowerCase();

  if (!athleteUid) {
    throw new HttpsError("invalid-argument", "athleteUid required.");
  }

  if (!parentEmail) {
    throw new HttpsError("invalid-argument", "parentEmail required.");
  }

  const athleteSnap =
    await db.collection("athletes").doc(athleteUid).get();

  if (!athleteSnap.exists) {
    throw new HttpsError("not-found", "Athlete not found.");
  }

  const athlete =
    athleteSnap.data() || {};

  let parentUid: string | null = null;

  try {
    const user =
      await admin.auth().getUserByEmail(parentEmail);

    parentUid = user.uid;
  } catch {
    parentUid = null;
  }

  const linkKey =
    String(parentUid || parentEmail)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_@.-]/g, "_");

  const linkId =
    `${linkKey}_${athleteUid}`;

  await db
    .collection("parentAthleteLinks")
    .doc(linkId)
    .set(
      {
        athleteUid,
        athleteName:
          athlete.publicName ||
          athlete.fullName ||
          athlete.name ||
          athleteUid,

        parentUid,
        parentEmail,

        role: "parent",
        status: parentUid ? "active" : "pending",

        source: "coach_repair_link",
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return {
    ok: true,
    linkId,
    athleteUid,
    parentEmail,
    parentUid,
    status: parentUid ? "active" : "pending",
  };
});