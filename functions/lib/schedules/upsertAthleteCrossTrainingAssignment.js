"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertAthleteCrossTrainingAssignment = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const crossTrainingPolicy_1 = require("./crossTrainingPolicy");
const db = (0, firestore_1.getFirestore)();
const allowedLocations = new Set(["santa-ynez-valley", "lompoc", "elk-grove"]);
function optionalTimestamp(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new https_1.HttpsError("invalid-argument", "Invalid assignment date.");
    return firestore_1.Timestamp.fromDate(date);
}
exports.upsertAthleteCrossTrainingAssignment = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    const issuer = await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.OPERATIONAL_STAFF_ROLES, "Active Coach, Management, or Admin access required.");
    const athleteId = (0, crossTrainingPolicy_1.cleanScheduleValue)(req.data?.athleteId).toUpperCase();
    const hostLocationId = (0, crossTrainingPolicy_1.normalizeScheduleLocationId)(req.data?.hostLocationId);
    const rosterId = (0, crossTrainingPolicy_1.cleanScheduleValue)(req.data?.rosterId);
    const status = (0, crossTrainingPolicy_1.cleanScheduleValue)(req.data?.status || "active").toLowerCase();
    const disciplineIds = [...new Set((Array.isArray(req.data?.disciplineIds) ? req.data.disciplineIds : [req.data?.disciplineId])
            .map((value) => (0, crossTrainingPolicy_1.normalizeScheduleDisciplineId)(value))
            .filter(Boolean))];
    if (!athleteId || !allowedLocations.has(hostLocationId) || !["active", "inactive"].includes(status)) {
        throw new https_1.HttpsError("invalid-argument", "Valid athlete, host location, and status are required.");
    }
    const athleteSnap = await db.doc(`athletes/${athleteId}`).get();
    if (!athleteSnap.exists)
        throw new https_1.HttpsError("not-found", "Athlete not found.");
    const athlete = athleteSnap.data() || {};
    const homeLocationId = (0, crossTrainingPolicy_1.athleteHomeLocationId)(athlete);
    if (!homeLocationId || homeLocationId === hostLocationId) {
        throw new https_1.HttpsError("failed-precondition", "Cross-training requires distinct home and host locations.");
    }
    if (!(0, crossTrainingPolicy_1.canStaffManageCrossTraining)(issuer.role, issuer.staff, homeLocationId, hostLocationId)) {
        throw new https_1.HttpsError("permission-denied", "Staff location scope does not authorize this assignment.");
    }
    const athleteDisciplines = new Set((0, crossTrainingPolicy_1.athleteScheduleDisciplineIds)(athlete));
    if (!disciplineIds.length || disciplineIds.some((id) => !athleteDisciplines.has(id))) {
        throw new https_1.HttpsError("failed-precondition", "Assignment disciplines must belong to the athlete.");
    }
    const requestedActiveFrom = optionalTimestamp(req.data?.activeFrom);
    const hasActiveTo = Object.prototype.hasOwnProperty.call(req.data || {}, "activeTo");
    const requestedActiveTo = hasActiveTo ? optionalTimestamp(req.data?.activeTo) : null;
    const assignmentId = (0, crossTrainingPolicy_1.crossTrainingAssignmentId)(athleteId, hostLocationId, rosterId);
    const ref = db.doc(`athleteCrossTrainingAssignments/${assignmentId}`);
    await db.runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        const immutable = existing.exists ? existing.data() || {} : {};
        const activeFrom = requestedActiveFrom || immutable.activeFrom || firestore_1.Timestamp.now();
        const activeTo = hasActiveTo ? requestedActiveTo : immutable.activeTo || null;
        if (activeTo && activeTo.toMillis() < activeFrom.toMillis()) {
            throw new https_1.HttpsError("invalid-argument", "activeTo must not precede activeFrom.");
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
            createdAt: immutable.createdAt || firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { ok: true, assignmentId, athleteId, homeLocationId, hostLocationId, status };
});
