import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { athleteHomeLocationId, canReadAthleteScheduleScope } from "./crossTrainingPolicy";

const db = getFirestore();

export const getAthleteScheduleScope = onCall(async (req) => {
  const callerUid = String(req.auth?.uid || "").trim();
  const athleteId = String(req.data?.athleteId || "").trim().toUpperCase();
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign-in required.");
  if (!athleteId) throw new HttpsError("invalid-argument", "athleteId required.");

  const athleteSnap = await db.doc(`athletes/${athleteId}`).get();
  if (!athleteSnap.exists) throw new HttpsError("not-found", "Athlete not found.");
  const athlete = athleteSnap.data() || {};

  let activeParentUids: string[] = [];
  if (String(athlete.authUid || "").trim() !== callerUid) {
    const parentLinks = await db.collection("parentAthleteLinks")
      .where("parentUid", "==", callerUid)
      .where("athleteUid", "==", athleteId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    activeParentUids = parentLinks.docs.map(
      (item) => String(item.data()?.parentUid || "").trim()
    );

    // Legacy compatibility for athletes activated before the
    // canonical parentAthleteLinks relationship existed.
    if (
      !activeParentUids.length &&
      String(athlete.parentUid || "").trim() === callerUid
    ) {
      activeParentUids = [callerUid];
    }
  }
  if (!canReadAthleteScheduleScope(callerUid, athlete.authUid, activeParentUids)) {
    throw new HttpsError("permission-denied", "Athlete schedule access denied.");
  }

  const assignmentsSnap = await db.collection("athleteCrossTrainingAssignments")
    .where("athleteId", "==", athleteId)
    .get();

  return {
    ok: true,
    athleteId,
    homeLocationId: athleteHomeLocationId(athlete),
    assignments: assignmentsSnap.docs
      .map((item): Record<string, any> & { id: string } => ({ id: item.id, ...item.data() }))
      .filter((item) => String(item.status || "").toLowerCase() === "active"),
  };
});
