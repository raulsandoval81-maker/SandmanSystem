import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  COACH_STAFF_ROLES,
  normalizeStaffRole,
  requireActiveStaff,
  staffHasLocation,
} from "../services/staffAuthorization";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function requireDocumentId(value: unknown, field: string): string {
  const id = clean(value);
  if (!id || id.length > 160 || id.includes("/") || id === "." || id === ".."
    || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return id;
}

function compactArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function timestampMillis(value: any): number {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  return 0;
}

export const getAthleteSessionHistory = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Staff authentication required.");
  const actor = await requireActiveStaff(
    request.auth.uid,
    COACH_STAFF_ROLES,
    "Active Coach or Admin access required."
  );
  const practiceId = requireDocumentId(request.data?.practiceId, "practiceId");
  const athleteId = requireDocumentId(request.data?.athleteId, "athleteId");
  const db = getFirestore();
  const practiceRef = db.doc(`practiceSessions/${practiceId}`);
  const athleteSessionRef = practiceRef.collection("athletes").doc(athleteId);

  const [practiceSnap, athleteSessionSnap] = await Promise.all([
    practiceRef.get(),
    athleteSessionRef.get(),
  ]);
  if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
  const practice = practiceSnap.data() || {};
  if (normalizeStaffRole(actor.role) !== "admin") {
    const locationId = clean(practice.locationId || practice.academyId);
    if (!locationId || !staffHasLocation(actor.staff, locationId)) {
      throw new HttpsError("permission-denied", "Practice location is outside the Coach's authorized scope.");
    }
    if (clean(practice.coachUid) !== actor.uid) {
      throw new HttpsError("permission-denied", "Only the Coach who opened this practice may read its athlete history.");
    }
  }
  if (!athleteSessionSnap.exists) {
    throw new HttpsError("not-found", "Athlete-session history not found.");
  }

  const [verificationSnap, xpSnap] = await Promise.all([
    athleteSessionRef.collection("verifiedSkills").get(),
    db.collection("xpLogs")
      .where("uid", "==", athleteId)
      .where("meta.attendanceSessionId", "==", practiceId)
      .get(),
  ]);
  const athleteSession = athleteSessionSnap.data() || {};
  const verifiedSkills = verificationSnap.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        skillId: clean(data.skillId),
        familyId: clean(data.familyId),
        discipline: clean(data.discipline),
        state: clean(data.state),
        coachUid: clean(data.coachUid),
        verifiedAt: data.verifiedAt || null,
      };
    })
    .sort((a, b) => {
      const identity = `${a.discipline}|${a.familyId}|${a.skillId}|${a.state}`
        .localeCompare(`${b.discipline}|${b.familyId}|${b.skillId}|${b.state}`);
      return identity || timestampMillis(a.verifiedAt) - timestampMillis(b.verifiedAt);
    });
  const awards = xpSnap.docs
    .filter((doc) => clean(doc.data()?.kind).toUpperCase() === "ATTENDANCE")
    .map((doc) => {
      const data = doc.data() || {};
      return {
        logId: doc.id,
        kind: "ATTENDANCE",
        amount: Number.isFinite(Number(data.amount)) ? Number(data.amount) : 0,
        createdAt: data.createdAt || null,
        coachUid: clean(data.coachUid),
        awardIdentity: clean(data.awardIdentity),
      };
    })
    .sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt)
      || a.logId.localeCompare(b.logId));

  return {
    ok: true,
    practiceId,
    athleteId,
    session: {
      attendanceSessionId: clean(athleteSession.attendanceSessionId),
      attendance: athleteSession.attendance || null,
      sessionDate: clean(athleteSession.sessionDate),
      locationId: clean(athleteSession.locationId),
      roomId: clean(athleteSession.roomId),
      discipline: clean(athleteSession.discipline),
      journey: clean(athleteSession.journey),
      program: clean(athleteSession.program),
      rankSnapshot: clean(athleteSession.rankSnapshot),
      tierSnapshot: clean(athleteSession.tierSnapshot),
      workedCards: compactArray(athleteSession.workedCards),
      workedSkillRefs: compactArray(athleteSession.workedSkillRefs),
      finalizedAt: athleteSession.finalizedAt || null,
    },
    verifiedSkills,
    xp: {
      awards,
      total: awards.reduce((sum, award) => sum + award.amount, 0),
    },
  };
});
