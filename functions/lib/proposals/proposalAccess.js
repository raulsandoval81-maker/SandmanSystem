"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireProposalStaffAccess = requireProposalStaffAccess;
exports.requireProposalLocationAccess = requireProposalLocationAccess;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
function cleanString(value) {
    return String(value ?? "").trim();
}
function normalizeRole(value) {
    return cleanString(value)
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}
function normalizeLocationIds(staff) {
    const values = new Set();
    const rawLocationIds = staff.locationIds;
    if (Array.isArray(rawLocationIds)) {
        for (const value of rawLocationIds) {
            const cleaned = cleanString(value);
            if (cleaned)
                values.add(cleaned);
        }
    }
    else {
        const cleaned = cleanString(rawLocationIds);
        if (cleaned)
            values.add(cleaned);
    }
    // Legacy single-location staff records remain supported.
    const legacyLocationId = cleanString(staff.locationId);
    if (legacyLocationId) {
        values.add(legacyLocationId);
    }
    return [...values];
}
const ALLOWED_PROPOSAL_ROLES = new Set([
    "admin",
    "system_admin",
    "management",
    "manager",
    "location_manager",
]);
async function requireProposalStaffAccess(uid) {
    const cleanUid = cleanString(uid);
    if (!cleanUid) {
        throw new https_1.HttpsError("unauthenticated", "A signed-in staff account is required.");
    }
    const db = (0, firestore_1.getFirestore)();
    const staffSnap = await db
        .collection("staff")
        .doc(cleanUid)
        .get();
    if (!staffSnap.exists) {
        throw new https_1.HttpsError("permission-denied", "An active Sandman staff record is required.");
    }
    const staff = staffSnap.data() || {};
    const status = cleanString(staff.status).toLowerCase();
    const role = normalizeRole(staff.role);
    if (status !== "active") {
        throw new https_1.HttpsError("permission-denied", "This staff account is not active.");
    }
    if (!ALLOWED_PROPOSAL_ROLES.has(role)) {
        throw new https_1.HttpsError("permission-denied", "This staff role does not have proposal access.");
    }
    return {
        uid: cleanUid,
        role,
        status,
        fullName: cleanString(staff.fullName) || null,
        teamId: cleanString(staff.teamId) || null,
        teamName: cleanString(staff.teamName) || null,
        locationIds: normalizeLocationIds(staff),
    };
}
function requireProposalLocationAccess(staffAccess, locationIdValue) {
    const locationId = cleanString(locationIdValue);
    if (!locationId) {
        throw new https_1.HttpsError("failed-precondition", "This proposal does not have a valid location.");
    }
    // Admin roles retain system-wide proposal oversight.
    if (staffAccess.role === "admin" ||
        staffAccess.role === "system_admin") {
        return;
    }
    if (!staffAccess.locationIds.includes(locationId)) {
        throw new https_1.HttpsError("permission-denied", "This proposal is outside your assigned location.");
    }
}
