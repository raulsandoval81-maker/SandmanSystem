import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  COACH_STAFF_ROLES,
  requireActiveStaff,
  requireCoachAthleteAccess,
} from "../services/staffAuthorization";

export const getTestingHistory = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const actor = await requireActiveStaff(req.auth.uid, COACH_STAFF_ROLES, "Active Coach access required.");
  const db = getFirestore();

  const snap = await db
    .collection("testingEvents")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const events = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const athleteId = String(data.uid || data.athleteId || "").trim();
    if (!athleteId) continue;
    const athleteSnap = await db.doc(`athletes/${athleteId}`).get();
    if (!athleteSnap.exists) continue;
    try {
      requireCoachAthleteAccess(actor, athleteSnap.data() || {});
    } catch (error) {
      if (error instanceof HttpsError && error.code === "permission-denied") continue;
      throw error;
    }
    events.push({
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
    });
  }
  return {
    ok: true,
    events,
  };
});
