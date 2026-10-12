import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { OPERATIONAL_STAFF_ROLES, requireActiveStaff } from "../services/staffAuthorization";
import {
  athleteHomeLocationId,
  athleteScheduleDisciplineIds,
  canStaffManageCrossTraining,
  cleanScheduleValue,
  crossTrainingAssignmentId,
  normalizeScheduleLocationId,
  normalizeScheduleDisciplineId,
} from "./crossTrainingPolicy";

const db = getFirestore();
const allowedLocations = new Set(["santa-ynez-valley", "lompoc", "elk-grove"]);

function optionalTimestamp(value: unknown): Timestamp | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) throw new HttpsError("invalid-argument", "Invalid assignment date.");
  return Timestamp.fromDate(date);
}

export const upsertAthleteCrossTrainingAssignment = onCall(async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
  const issuer = await requireActiveStaff(
    req.auth.uid,
    OPERATIONAL_STAFF_ROLES,
    "Active Coach, Management, or Admin access required."
  );
  const athleteId = cleanScheduleValue(req.data?.athleteId).toUpperCase();
  const hostLocationId = normalizeScheduleLocationId(req.data?.hostLocationId);
  const rosterId = cleanScheduleValue(req.data?.rosterId);
  const status = cleanScheduleValue(req.data?.status || "active").toLowerCase();
  const disciplineIds: string[] = [...new Set<string>(
    (Array.isArray(req.data?.disciplineIds) ? req.data.disciplineIds : [req.data?.disciplineId])
      .map((value: unknown) => normalizeScheduleDisciplineId(value))
      .filter(Boolean)
  )];
  if (!athleteId || !allowedLocations.has(hostLocationId) || !["active", "inactive"].includes(status)) {
    throw new HttpsError("invalid-argument", "Valid athlete, host location, and status are required.");
  }


  const requestedActiveFrom = optionalTimestamp(req.data?.activeFrom);
  const hasActiveTo = Object.prototype.hasOwnProperty.call(req.data || {}, "activeTo");
  const requestedActiveTo = hasActiveTo ? optionalTimestamp(req.data?.activeTo) : null;
  const assignmentId = crossTrainingAssignmentId(athleteId, hostLocationId, rosterId);
  const ref = db.doc(`athleteCrossTrainingAssignments/${assignmentId}`);
  await db.runTransaction(async (tx) => {
    const athleteSnap = await tx.get(db.doc(`athletes/${athleteId}`));
    if (!athleteSnap.exists) throw new HttpsError("not-found", "Athlete not found.");
    const athlete = athleteSnap.data() || {};
    const homeLocationId = athleteHomeLocationId(athlete);
    if (!homeLocationId || homeLocationId === hostLocationId) {
      throw new HttpsError("failed-precondition", "Cross-training requires distinct home and host locations.");
    }
    if (!canStaffManageCrossTraining(issuer.role, issuer.staff, homeLocationId, hostLocationId)) {
      throw new HttpsError("permission-denied", "Staff location scope does not authorize this assignment.");
    }
    const athleteDisciplines = new Set(athleteScheduleDisciplineIds(athlete));
    if (!disciplineIds.length || disciplineIds.some((id) => !athleteDisciplines.has(id))) {
      throw new HttpsError("failed-precondition", "Assignment disciplines must belong to the athlete.");
    }
    const existing = await tx.get(ref);
    const prior = existing.exists ? existing.data() || {} : {};
    const activeFrom = requestedActiveFrom || prior.activeFrom || Timestamp.now();
    const activeTo = hasActiveTo ? requestedActiveTo : prior.activeTo || null;
    if (activeTo && activeTo.toMillis() < activeFrom.toMillis()) {
      throw new HttpsError("invalid-argument", "activeTo must not precede activeFrom.");
    }
    const previousDisciplines: string[] = Array.isArray(prior.disciplineIds)
      ? prior.disciplineIds.map((id: unknown) => normalizeScheduleDisciplineId(id)).filter(Boolean) : [];
    const sameTime = (a: unknown, b: Timestamp | null) =>
      (a instanceof Timestamp ? a.toMillis() : null) === (b ? b.toMillis() : null);
    const sameDisciplines = previousDisciplines.length === disciplineIds.length
      && previousDisciplines.every((id) => disciplineIds.includes(id));
    const sourceChanged = !existing.exists
      || prior.homeLocationId !== homeLocationId
      || prior.hostLocationId !== hostLocationId
      || prior.status !== status
      || !sameDisciplines
      || !sameTime(prior.activeFrom, activeFrom)
      || !sameTime(prior.activeTo, activeTo);
    if (!sourceChanged) return;
    const now = FieldValue.serverTimestamp();
    tx.set(ref, {
      athleteId,
      homeLocationId,
      hostLocationId,
      rosterId,
      disciplineIds,
      status,
      approvedBy: prior.approvedBy || issuer.uid,
      approvedByRole: prior.approvedByRole || issuer.role,
      activeFrom,
      activeTo,
      createdAt: prior.createdAt || now,
      updatedAt: now,
    });
    // Old and new assignment disciplines may both lose or gain history scope.
    for (const discipline of new Set([...previousDisciplines, ...disciplineIds])) {
      if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(discipline)) {
        throw new HttpsError("failed-precondition", "Invalid historical discipline identity.");
      }
      tx.set(db.doc(`athletes/${athleteId}/historyRevisions/${discipline}`), {
        revision: FieldValue.increment(1),
        lastMutationKind: "cross-training-assignment-change",
        updatedAt: now,
      }, { merge: true });
    }
  });
  return { ok: true, assignmentId, athleteId, hostLocationId, status };
});
