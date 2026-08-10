"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireProposalStaffAccess = requireProposalStaffAccess;
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
const ALLOWED_PROPOSAL_ROLES = new Set([
    "admin",
    "system_admin",
    "location_manager",
    "program_manager",
    "coach",
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
    };
}
