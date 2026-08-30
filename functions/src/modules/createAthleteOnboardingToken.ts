import * as crypto from "crypto";
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = getFirestore();

const MANAGEMENT_ROLES = new Set([
  "admin",
  "management",
  "manager",
  "location_manager",
]);

const TOKEN_HOURS = 48;

export const createAthleteOnboardingToken = onCall(async (req) => {
  const staffUid = req.auth?.uid;

  if (!staffUid) {
    throw new HttpsError(
      "unauthenticated",
      "Must be signed in."
    );
  }

  const staffSnap = await db.doc(`staff/${staffUid}`).get();

  if (!staffSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "Staff access required"
    );
  }

  const staff = staffSnap.data() || {};

  const role = String(staff.role || "")
    .trim()
    .toLowerCase();

  const status = String(staff.status || "")
    .trim()
    .toLowerCase();

  if (
    status !== "active" ||
    !MANAGEMENT_ROLES.has(role)
  ) {
    throw new HttpsError(
      "permission-denied",
      "Active Management access required"
    );
  }

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

  const tokenId = crypto.randomBytes(32).toString("hex");
  const exp = Date.now() + TOKEN_HOURS * 60 * 60 * 1000;

  await db.collection("onboardingTokens").doc(tokenId).set({
    athleteUid,
    exp,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: staffUid,
    createdByRole: role,
    source: "management_athlete_access",
  });

  return {
    ok: true,
    athleteUid,
    tokenId,
    exp,
  };
});
