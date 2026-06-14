import { onCall } from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
} from "firebase-admin/firestore";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const approveIntakeCall = onCall(async (req) => {
  if (!req.auth) {
    throw new Error("unauthenticated");
  }

  const { intakeId, approvedUid, note } = req.data || {};

  if (!intakeId || !approvedUid) {
    throw new Error("missing fields");
  }

  const db = getFirestore();

  const intakeRef =
    db.collection("intakes").doc(String(intakeId));

  const intakeSnap =
    await intakeRef.get();

  const intake =
    intakeSnap.data() || {};

  const parentEmail =
    String(intake.parent?.email || "")
      .trim()
      .toLowerCase();

  let parentUid = "";

  if (parentEmail) {
    try {
      const user =
        await admin.auth().getUserByEmail(parentEmail);

      parentUid = user.uid;
    } catch (err) {
      parentUid = "";
    }
  }

  await intakeRef.update({
    status: "approved",
    approvedUid,
    approvedAt: FieldValue.serverTimestamp(),
    note: note || null,
    linkedParentUid: parentUid || null,
    parentLinked: !!parentUid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (parentUid) {
    await db
      .collection("parentAthleteLinks")
      .doc(`${parentUid}_${approvedUid}`)
      .set(
        {
          parentUid,
          athleteUid: approvedUid,
          status: "active",
          intakeId,
          source: "approve_intake_existing_athlete",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    await db.collection("parents").doc(parentUid).set(
      {
        uid: parentUid,
        email: parentEmail,
        athleteUid: approvedUid,
        primaryAthleteUid: approvedUid,
        status: "active",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    ok: true,
    intakeId,
    approvedUid,
    parentLinked: !!parentUid,
    parentUid: parentUid || null,
  };
});