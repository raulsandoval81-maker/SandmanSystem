"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANAGEMENT_STAFF_ROLES = exports.OPERATIONAL_STAFF_ROLES = void 0;
exports.normalizeStaffRole = normalizeStaffRole;
exports.isAuthorizedStaffRecord = isAuthorizedStaffRecord;
exports.requireActiveStaff = requireActiveStaff;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
exports.OPERATIONAL_STAFF_ROLES = Object.freeze([
    "admin", "system_admin", "management", "manager", "location_manager", "coach",
]);
exports.MANAGEMENT_STAFF_ROLES = Object.freeze([
    "admin", "system_admin", "management", "manager", "location_manager",
]);
function normalizeStaffRole(value) {
    return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
function isAuthorizedStaffRecord(staff, allowedRoles) {
    return String(staff.status ?? "").trim().toLowerCase() === "active"
        && allowedRoles.includes(normalizeStaffRole(staff.role));
}
async function requireActiveStaff(uid, allowedRoles, message = "Active staff access required.") {
    const staffUid = String(uid ?? "").trim();
    if (!staffUid)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    const snap = await (0, firestore_1.getFirestore)().doc(`staff/${staffUid}`).get();
    if (!snap.exists)
        throw new https_1.HttpsError("permission-denied", message);
    const staff = snap.data() || {};
    const role = normalizeStaffRole(staff.role);
    const status = String(staff.status ?? "").trim().toLowerCase();
    if (!isAuthorizedStaffRecord(staff, allowedRoles)) {
        throw new https_1.HttpsError("permission-denied", message);
    }
    return { uid: staffUid, role, status, staff };
}
