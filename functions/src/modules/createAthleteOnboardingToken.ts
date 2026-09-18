import * as crypto from "crypto";
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff, requireStaffLocation } from "../services/staffAuthorization";

if (!admin.apps.length) admin.initializeApp();
const db = getFirestore();

const TOKEN_HOURS = 48;

export const createAthleteOnboardingToken = onCall(async (req) => {
  const staffUid = req.auth?.uid;

  if (!staffUid) {
    throw new HttpsError(
      "unauthenticated",
      "Must be signed in."
    );
  }

  const actor = await requireActiveStaff(
    staffUid,
    MANAGEMENT_STAFF_ROLES,
    "Active Management access required"
  );

  const athleteUid = String(
    req.data?.athleteUid || ""
  ).trim().toUpperCase();

  if (!athleteUid) {
    throw new HttpsError(
      "invalid-argument",
      "Missing athleteUid."
    );
  }

  const athleteRef = db.collection("athletes").doc(athleteUid);
  const athleteSnap = await athleteRef.get();

  if (!athleteSnap.exists) {
    throw new HttpsError(
      "not-found",
      `Athlete not found: ${athleteUid}`
    );
  }
  requireStaffLocation(actor, athleteSnap.data()?.locationId, "This athlete is outside your authorized location scope.");

  const tokenId = crypto.randomBytes(32).toString("hex");
  const exp = Date.now() + TOKEN_HOURS * 60 * 60 * 1000;

  await db.collection("onboardingTokens").doc(tokenId).set({
    athleteUid,
    exp,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: staffUid,
    createdByRole: actor.role,
    source: "management_athlete_access",
  });

  return {
    ok: true,
    athleteUid,
    tokenId,
    exp,
  };
});
