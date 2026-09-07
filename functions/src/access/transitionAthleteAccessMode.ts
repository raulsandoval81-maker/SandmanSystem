import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff } from "../services/staffAuthorization";
import { assertAthleteAccessTransition } from "./accessInvitationPolicy";

const db = getFirestore();

export const transitionAthleteAccessMode = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  await requireActiveStaff(req.auth.uid, MANAGEMENT_STAFF_ROLES, "Active Management access required.");

  const athleteUid = String(req.data?.athleteUid || "").trim().toUpperCase();
  const targetMode = String(req.data?.targetMode || "").trim().toLowerCase();
  if (!athleteUid) throw new HttpsError("invalid-argument", "Athlete ID required.");

  return db.runTransaction(async (tx) => {
    const athleteRef = db.doc(`athletes/${athleteUid}`);
    const athleteSnap = await tx.get(athleteRef);
    if (!athleteSnap.exists) throw new HttpsError("not-found", "Athlete not found.");
    const athlete = athleteSnap.data() || {};
    let decision;
    try {
      decision = assertAthleteAccessTransition({
        currentMode: athlete.access?.mode,
        targetMode,
        existingAuthUid: athlete.authUid,
      });
    } catch (error) {
      const reason = String((error as Error)?.message || "");
      if (reason === "DIRECT_ACCESS_NOT_ACTIVE") {
        throw new HttpsError("failed-precondition", "Athlete direct access is not active.");
      }
      throw new HttpsError("failed-precondition", "Only active hybrid access may transition to self-managed.");
    }
    if (!decision.already) tx.update(athleteRef, { "access.mode": decision.targetMode });
    return { ok: true, athleteUid, accessMode: decision.targetMode, already: decision.already };
  });
});
