"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireCoachOrAdminV2 = requireCoachOrAdminV2;
// functions/src/infra/authzV2.ts
const https_1 = require("firebase-functions/v2/https");
function requireCoachOrAdminV2(req) {
    const uid = req.auth?.uid || null;
    const token = (req.auth?.token || {});
    // support both token.role and token.roles
    const role = typeof token.role === "string"
        ? token.role
        : (Array.isArray(token.roles) && typeof token.roles[0] === "string" ? token.roles[0] : "");
    const roles = Array.isArray(token.roles) ? token.roles : [];
    const isCoachOrAdmin = role === "admin" ||
        role === "coach" ||
        roles.includes("admin") ||
        roles.includes("coach");
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    if (!isCoachOrAdmin) {
        throw new https_1.HttpsError("permission-denied", "Coach/Admin only");
    }
    return { uid, role, roles };
}
