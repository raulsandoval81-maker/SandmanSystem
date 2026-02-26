"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yyyymm = void 0;
exports.logAdmin = logAdmin;
exports.logIntakeApprove = logIntakeApprove;
exports.logIntakeInvite = logIntakeInvite;
// functions/src/infra/logAdmin.ts
const admin_1 = require("./admin");
/** Month key "YYYYMM" for /adminLogs/{domain}/{YYYYMM}/... */
const yyyymm = (d = new Date()) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
exports.yyyymm = yyyymm;
/**
 * Append a single admin log entry.
 * - Domain buckets (e.g., "intake", "xp", "security")
 * - Monthly subcollection {YYYYMM}
 * - Writes *new* docs only (no updates)
 */
async function logAdmin(domain, action, payload = {}) {
    const bucket = (0, exports.yyyymm)();
    await admin_1.db
        .collection("adminLogs")
        .doc(domain) // e.g., "intake"
        .collection(bucket) // e.g., "202510"
        .add({
        action, // e.g., "approve_intake"
        ...payload,
        ts: admin_1.admin.firestore.FieldValue.serverTimestamp(),
    });
}
async function logIntakeApprove(payload) {
    return logAdmin("intake", "approve_intake", payload);
}
async function logIntakeInvite(payload) {
    return logAdmin("intake", "create_invite", payload);
}
/* -------------------------------------------------------
 * More wrappers as you grow:
 *   - logXpAward(...)
 *   - logSecurityEvent(...)
 *   - logExceptionDecision(...)
 * -----------------------------------------------------*/
