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

  const athleteSnap = await db.doc(`athletes/${athleteId}`).get();
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

  const requestedActiveFrom = optionalTimestamp(req.data?.activeFrom);
  const hasActiveTo = Object.prototype.hasOwnProperty.call(req.data || {}, "activeTo");
  const requestedActiveTo = hasActiveTo ? optionalTimestamp(req.data?.activeTo) : null;
  const assignmentId = crossTrainingAssignmentId(athleteId, hostLocationId, rosterId);
  const ref = db.doc(`athleteCrossTrainingAssignments/${assignmentId}`);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const immutable = existing.exists ? existing.data() || {} : {};
    const activeFrom = requestedActiveFrom || immutable.activeFrom || Timestamp.now();
    const activeTo = hasActiveTo ? requestedActiveTo : immutable.activeTo || null;
    if (activeTo && activeTo.toMillis() < activeFrom.toMillis()) {
      throw new HttpsError("invalid-argument", "activeTo must not precede activeFrom.");
    }
    tx.set(ref, {
      athleteId,
      homeLocationId,
      hostLocationId,
      rosterId,
      disciplineIds,
      status,
      approvedBy: immutable.approvedBy || issuer.uid,
      approvedByRole: immutable.approvedByRole || issuer.role,
      activeFrom,
      activeTo,
      createdAt: immutable.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true, assignmentId, athleteId, homeLocationId, hostLocationId, status };
});
