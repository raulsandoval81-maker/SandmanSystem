"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_LOCATION_IDS = exports.CANONICAL_STAFF_STATUSES = exports.CANONICAL_STAFF_ROLES = void 0;
exports.validateStaffGovernanceUpdate = validateStaffGovernanceUpdate;
exports.removesActiveAdmin = removesActiveAdmin;
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
exports.CANONICAL_STAFF_ROLES = Object.freeze(["admin", "management", "coach"]);
exports.CANONICAL_STAFF_STATUSES = Object.freeze(["active", "inactive"]);
exports.CANONICAL_LOCATION_IDS = Object.freeze([
    "lompoc",
    "santa-ynez-valley",
    "elk-grove",
]);
function validateStaffGovernanceUpdate(input) {
    const source = input && typeof input === "object" ? input : {};
    const staffUid = String(source.staffUid ?? "").trim();
    const role = String(source.role ?? "").trim().toLowerCase();
    const status = String(source.status ?? "").trim().toLowerCase();
    if (!staffUid)
        throw new https_1.HttpsError("invalid-argument", "staffUid is required.");
    if (!exports.CANONICAL_STAFF_ROLES.includes(role)) {
        throw new https_1.HttpsError("invalid-argument", "A canonical staff role is required.");
    }
    if (!exports.CANONICAL_STAFF_STATUSES.includes(status)) {
        throw new https_1.HttpsError("invalid-argument", "A canonical staff status is required.");
    }
    if (!Array.isArray(source.locationIds)) {
        throw new https_1.HttpsError("invalid-argument", "locationIds must be an array.");
    }
    const locationIds = source.locationIds.map((value) => String(value ?? "").trim());
    if (locationIds.some((value) => !value || !exports.CANONICAL_LOCATION_IDS.includes(value))) {
        throw new https_1.HttpsError("invalid-argument", "locationIds contains an unknown location.");
    }
    if (new Set(locationIds).size !== locationIds.length) {
        throw new https_1.HttpsError("invalid-argument", "locationIds cannot contain duplicates.");
    }
    if (role !== "admin" && locationIds.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "Management and Coach require explicit location scope.");
    }
    return { staffUid, role: role, status: status, locationIds };
}
function removesActiveAdmin(current, update) {
    return (0, staffAuthorization_1.normalizeStaffRole)(current.role) === "admin"
        && (0, staffAuthorization_1.normalizeStaffStatus)(current.status) === "active"
        && (update.role !== "admin" || update.status !== "active");
}
