import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import {
  OPERATIONAL_STAFF_ROLES,
  requireActiveStaff,
  requireCoachAthleteAccess,
  requireStaffLocation,
} from "../../services/staffAuthorization";

export const linkParentToAthlete = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Staff sign-in required.");
  }

  const actor = await requireActiveStaff(
    req.auth.uid,
    OPERATIONAL_STAFF_ROLES,
    "Active Admin, Management, or Coach access required."
  );

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

  const athleteLocationId = String(
    athlete.locationId || ""
  ).trim();

  if (!athleteLocationId) {
    throw new HttpsError(
      "failed-precondition",
      "Athlete is missing canonical location ownership."
    );
  }

  if (actor.role === "management") {
    requireStaffLocation(
      actor,
      athleteLocationId,
      "This athlete is outside the Management staff member's authorized scope."
    );
  } else if (actor.role === "coach") {
    requireCoachAthleteAccess(
      actor,
      athlete,
      "This athlete is outside the Coach's authorized training scope."
    );
  } else if (actor.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Active Admin, Management, or Coach access required."
    );
  }

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
