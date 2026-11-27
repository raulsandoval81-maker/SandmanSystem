import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  OPERATIONAL_STAFF_ROLES,
  requireActiveStaff,
  requireCoachAthleteAccess,
  requireStaffLocation,
} from "./staffAuthorization";

export async function requireAthleteProfileRead(
  auth: { uid: string; token: { firebase?: { sign_in_provider?: string } } } | undefined,
  rawId: unknown,
) {
  if (!auth?.uid || auth.token.firebase?.sign_in_provider === "anonymous") {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  const athleteId = typeof rawId === "string" ? rawId.trim() : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(athleteId)) {
    throw new HttpsError("invalid-argument", "A valid athlete ID is required.");
  }

  const db = getFirestore();
  const snapshot = await db.collection("athletes").doc(athleteId).get();
  const athlete = snapshot.data();
  const message = "Athlete profile access denied.";
  if (!athlete) throw new HttpsError("permission-denied", message);

  if (athlete.authUid === auth.uid ||
      (athlete.authUid == null && athleteId === auth.uid) ||
      athlete.parentUid === auth.uid) {
    return { db, athleteId, athlete };
  }

  const parentLinks = await db.collection("parentAthleteLinks")
    .where("parentUid", "==", auth.uid)
    .where("athleteUid", "==", athleteId)
    .where("status", "==", "active").limit(1).get();
  if (!parentLinks.empty) return { db, athleteId, athlete };

  const actor = await requireActiveStaff(auth.uid, OPERATIONAL_STAFF_ROLES, message);
  if (actor.role === "management") {
    requireStaffLocation(actor, athlete.locationId, message);
  } else {
    requireCoachAthleteAccess(actor, athlete, message);
  }
  return { db, athleteId, athlete };
}
