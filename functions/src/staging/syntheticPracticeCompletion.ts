import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  COACH_STAFF_ROLES,
  normalizeStaffRole,
  requireActiveStaff,
  requireCoachAthleteAccess,
  requireStaffLocation,
} from "../services/staffAuthorization";

const STAGING_PROJECT_ID = "sandman-combat-staging";
const CONFIRMATION = "COMPLETE SYNTHETIC TEST SESSION";

function cleanId(value: unknown, field: string): string {
  const id = String(value ?? "").trim();
  if (!id || id.length > 160 || id.includes("/") || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return id;
}

export function currentFirebaseProjectId(environment: NodeJS.ProcessEnv = process.env): string {
  const direct = String(environment.GCLOUD_PROJECT || environment.GOOGLE_CLOUD_PROJECT || "").trim();
  if (direct) return direct;
  try {
    return String(JSON.parse(environment.FIREBASE_CONFIG || "{}").projectId || "").trim();
  } catch {
    return "";
  }
}

function requireVerifiedCoachToken(auth: any): void {
  if (!auth) throw new HttpsError("unauthenticated", "Verified Coach authentication is required.");
  if (auth.token?.firebase?.sign_in_provider === "anonymous" || auth.token?.email_verified !== true) {
    throw new HttpsError("unauthenticated", "A verified, non-anonymous Coach session is required.");
  }
}

export const completeSyntheticPracticeForTesting = onCall(async (request) => {
  if (currentFirebaseProjectId() !== STAGING_PROJECT_ID) {
    throw new HttpsError("failed-precondition", "Synthetic practice completion is available only in the isolated staging project.");
  }
  requireVerifiedCoachToken(request.auth);
  if (String(request.data?.confirmation || "") !== CONFIRMATION) {
    throw new HttpsError("invalid-argument", "Explicit synthetic-session confirmation is required.");
  }

  const practiceId = cleanId(request.data?.practiceId, "practiceId");
  const athleteId = cleanId(request.data?.athleteId, "athleteId");
  const actor = await requireActiveStaff(request.auth!.uid, COACH_STAFF_ROLES, "Active Coach or Admin access required.");
  const db = getFirestore();
  const practiceRef = db.doc(`practiceSessions/${practiceId}`);
  const attendanceRef = db.doc(`attendance_sessions/${practiceId}`);
  const athleteRef = db.doc(`athletes/${athleteId}`);
  let idempotent = false;

  await db.runTransaction(async (tx) => {
    const [practiceSnap, attendanceSnap, athleteSnap] = await Promise.all([
      tx.get(practiceRef), tx.get(attendanceRef), tx.get(athleteRef),
    ]);
    if (!practiceSnap.exists || !attendanceSnap.exists || !athleteSnap.exists) {
      throw new HttpsError("not-found", "The designated synthetic practice, attendance, or athlete record was not found.");
    }
    const practice = practiceSnap.data() || {};
    const attendance = attendanceSnap.data() || {};
    const athlete = athleteSnap.data() || {};
    const designatedAthleteId = String(practice.syntheticTestAthleteId || "").trim();
    const attendanceAthleteId = String(attendance.syntheticTestAthleteId || "").trim();
    const checkedInIds = Array.isArray(attendance.checkedInIds) ? attendance.checkedInIds.map(String) : [];

    if (practice.synthetic !== true || attendance.synthetic !== true || athlete.synthetic !== true
      || practice.syntheticTestCompletionEnabled !== true || attendance.syntheticTestCompletionEnabled !== true
      || athlete.syntheticTestXpEnabled !== true || designatedAthleteId !== athleteId
      || attendanceAthleteId !== athleteId || checkedInIds.length !== 1 || checkedInIds[0] !== athleteId) {
      throw new HttpsError("failed-precondition", "This is not the explicitly designated staging synthetic practice and athlete.");
    }
    if (String(practice.status || "").toLowerCase() !== "active") {
      throw new HttpsError("failed-precondition", "The designated synthetic practice must be active.");
    }
    const locationId = String(practice.locationId || practice.academyId || "").trim();
    requireStaffLocation(actor, locationId);
    requireCoachAthleteAccess(actor, athlete);
    if (normalizeStaffRole(actor.role) !== "admin" && String(practice.coachUid || "") !== actor.uid) {
      throw new HttpsError("permission-denied", "Only the assigned Coach may complete this synthetic test practice.");
    }

    const prior = practice.sessionMemory?.syntheticExecution;
    if (prior?.synthetic === true) {
      if (String(prior.athleteId || "") !== athleteId) {
        throw new HttpsError("failed-precondition", "Synthetic completion identity does not match the designated athlete.");
      }
      idempotent = true;
      return;
    }

    tx.update(practiceRef, {
      "sessionMemory.syntheticExecution": {
        synthetic: true,
        simulated: true,
        realTraining: false,
        minutesWorked: 0,
        workedCards: [],
        athleteId,
        completedBy: actor.uid,
        completedAt: FieldValue.serverTimestamp(),
      },
      syntheticExecutionCompleted: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, synthetic: true, realTraining: false, minutesWorked: 0, practiceId, athleteId, idempotent };
});
