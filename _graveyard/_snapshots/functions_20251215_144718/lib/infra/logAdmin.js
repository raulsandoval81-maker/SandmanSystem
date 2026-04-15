"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.yyyymm = exports.db = void 0;
exports.logAdmin = logAdmin;
exports.logIntakeApprove = logIntakeApprove;
exports.logIntakeInvite = logIntakeInvite;
// functions/src/infra/logAdmin.ts
const admin = __importStar(require("firebase-admin"));
// Initialize Admin exactly once (safe in emulator and prod)
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.db = admin.firestore();
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
    await exports.db
        .collection("adminLogs")
        .doc(domain) // e.g., "intake"
        .collection(bucket) // e.g., "202510"
        .add({
        action, // e.g., "approve_intake"
        ...payload,
        ts: admin.firestore.FieldValue.serverTimestamp(),
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
