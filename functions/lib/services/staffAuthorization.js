"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COACH_STAFF_ROLES = exports.MANAGEMENT_STAFF_ROLES = exports.OPERATIONAL_STAFF_ROLES = void 0;
exports.normalizeStaffRole = normalizeStaffRole;
exports.normalizeStaffStatus = normalizeStaffStatus;
exports.normalizeStaffList = normalizeStaffList;
exports.normalizeStaffScope = normalizeStaffScope;
exports.normalizeStaffRecord = normalizeStaffRecord;
exports.staffLocationIds = staffLocationIds;
exports.staffHasLocation = staffHasLocation;
exports.requireStaffLocation = requireStaffLocation;
exports.requireCoachAthleteAccess = requireCoachAthleteAccess;
exports.requireCoachAthleteAccessById = requireCoachAthleteAccessById;
exports.isAuthorizedStaffRecord = isAuthorizedStaffRecord;
exports.requireActiveStaff = requireActiveStaff;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
exports.OPERATIONAL_STAFF_ROLES = Object.freeze([
    "admin", "management", "coach",
]);
exports.MANAGEMENT_STAFF_ROLES = Object.freeze([
    "admin", "management",
]);
exports.COACH_STAFF_ROLES = Object.freeze([
    "admin", "coach",
]);
function normalizeStaffRole(value) {
    const role = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (role === "system_admin")
        return "admin";
    if (role === "manager" || role === "location_manager")
        return "management";
    return role;
}
function normalizeStaffStatus(value) {
    return String(value ?? "").trim().toLowerCase();
}
function normalizeStaffList(...values) {
    const normalized = new Set();
    for (const value of values) {
        for (const item of Array.isArray(value) ? value : [value]) {
            const clean = String(item ?? "").trim();
            if (clean)
                normalized.add(clean);
        }
    }
    return [...normalized];
}
function normalizeStaffScope(staff) {
    return {
        organizationIds: normalizeStaffList(staff.organizationIds, staff.organizationId),
        academyIds: normalizeStaffList(staff.academyIds, staff.academyId),
        locationIds: normalizeStaffList(staff.locationIds, staff.locations, staff.locationId),
        programIds: normalizeStaffList(staff.programIds, staff.programs, staff.programId),
    };
}
function normalizeStaffRecord(staff) {
    return {
        ...staff,
        rawRole: String(staff.role ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_"),
        role: normalizeStaffRole(staff.role),
        status: normalizeStaffStatus(staff.status),
        scope: normalizeStaffScope(staff),
    };
}
function staffLocationIds(staff) {
    return normalizeStaffScope(staff).locationIds;
}
function staffHasLocation(staff, locationId) {
    const location = String(locationId ?? "").trim();
    return Boolean(location) && staffLocationIds(staff).includes(location);
}
function requireStaffLocation(actor, locationId, message = "This location is outside the staff member's authorized scope.") {
    const location = String(locationId ?? "").trim();
    if (!location)
        throw new https_1.HttpsError("failed-precondition", "A valid location is required.");
    if (normalizeStaffRole(actor.role) !== "admin" && !staffHasLocation(actor.staff, location)) {
        throw new https_1.HttpsError("permission-denied", message);
    }
    return location;
}
function requireCoachAthleteAccess(actor, athlete, message = "This athlete is outside the Coach's authorized training scope.") {
    if (normalizeStaffRole(actor.role) === "admin")
        return;
    if (normalizeStaffRole(actor.role) !== "coach") {
        throw new https_1.HttpsError("permission-denied", message);
    }
    const assignedCoachIds = normalizeStaffList(athlete.coachUid, athlete.coachIds);
    const directlyAssigned = assignedCoachIds.includes(actor.uid);
    const locationId = String(athlete.locationId ?? "").trim();
    if (!directlyAssigned && !staffHasLocation(actor.staff, locationId)) {
        throw new https_1.HttpsError("permission-denied", message);
    }
}
async function requireCoachAthleteAccessById(actor, athleteId, message) {
    const id = String(athleteId ?? "").trim();
    if (!id)
        throw new https_1.HttpsError("invalid-argument", "A valid athlete ID is required.");
    const snap = await (0, firestore_1.getFirestore)().doc(`athletes/${id}`).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", `Athlete not found: ${id}`);
    const athlete = snap.data() || {};
    requireCoachAthleteAccess(actor, athlete, message);
    return athlete;
}
function isAuthorizedStaffRecord(staff, allowedRoles) {
    const normalizedAllowedRoles = allowedRoles.map(normalizeStaffRole);
    return normalizeStaffStatus(staff.status) === "active"
        && normalizedAllowedRoles.includes(normalizeStaffRole(staff.role));
}
async function requireActiveStaff(uid, allowedRoles, message = "Active staff access required.") {
    const staffUid = String(uid ?? "").trim();
    if (!staffUid)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    const snap = await (0, firestore_1.getFirestore)().doc(`staff/${staffUid}`).get();
    if (!snap.exists)
        throw new https_1.HttpsError("permission-denied", message);
    const source = snap.data() || {};
    const staff = normalizeStaffRecord(source);
    const role = staff.role;
    const status = staff.status;
    if (!isAuthorizedStaffRecord(source, allowedRoles)) {
        throw new https_1.HttpsError("permission-denied", message);
    }
    return { uid: staffUid, role, status, staff, scope: staff.scope };
}
