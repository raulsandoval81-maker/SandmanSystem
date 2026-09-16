"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGEMENT_STAFF_ROLES = exports.OPERATIONAL_STAFF_ROLES = void 0;
exports.normalizeStaffRole = normalizeStaffRole;
exports.normalizeStaffStatus = normalizeStaffStatus;
exports.normalizeStaffList = normalizeStaffList;
exports.normalizeStaffScope = normalizeStaffScope;
exports.normalizeStaffRecord = normalizeStaffRecord;
exports.staffLocationIds = staffLocationIds;
exports.staffHasLocation = staffHasLocation;
exports.requireStaffLocation = requireStaffLocation;
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
        locationIds: normalizeStaffList(staff.locationIds, staff.locations, staff.locationId),
    };
}
function normalizeStaffRecord(staff) {
    return {
        ...staff,
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
    const role = normalizeStaffRole(staff.role);
    const status = staff.status;
    if (!isAuthorizedStaffRecord(source, allowedRoles)) {
        throw new https_1.HttpsError("permission-denied", message);
    }
    return { uid: staffUid, role, status, staff, scope: staff.scope };
}
