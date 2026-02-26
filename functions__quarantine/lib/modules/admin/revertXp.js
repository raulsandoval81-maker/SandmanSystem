"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revertXpLog = void 0;
// functions/src/modules/admin/revertXp.ts
const https_1 = require("firebase-functions/v2/https");
const logger_1 = require("firebase-functions/logger");
const admin_1 = require("../../infra/admin");
const authzV2_1 = require("../../infra/authzV2");
/**
 * Admin/Coach rollback: given an xpLog ID, apply the inverse XP to the athlete
 * and write an immutable reversal log linked to the original.
 *
 * Input: { logId: string, note?: string }
 * Returns: { ok:true, athleteUid, inverse, newXp }
 */
exports.revertXpLog = (0, https_1.onCall)(async (req) => {
    // 🔒 Auth gate (v2)
    (0, authzV2_1.requireCoachOrAdminV2)(req);
    try {
        const logId = req.data?.logId;
        const note = req.data?.note || null;
        if (!logId) {
            throw new https_1.HttpsError("invalid-argument", "logId is required.");
        }
        // Load the original log
        const logRef = admin_1.db.collection("xpLogs").doc(logId);
        const logSnap = await logRef.get();
        if (!logSnap.exists) {
            throw new https_1.HttpsError("not-found", "XP log not found.");
        }
        const log = logSnap.data();
        const athleteUid = String(log.athleteUid || "");
        // Prevent double-reverts
        const priorRevert = await admin_1.db
            .collection("xpLogs")
            .where("parentLogId", "==", logId)
            .limit(1)
            .get();
        if (!priorRevert.empty) {
            throw new https_1.HttpsError("failed-precondition", "This log was already reverted.");
        }
        const delta = Number(log.delta || 0);
        if (!delta) {
            throw new https_1.HttpsError("failed-precondition", "Original log has no delta.");
        }
        const inverse = -delta;
        const now = admin_1.admin.firestore.FieldValue.serverTimestamp();
        const athleteRef = admin_1.db.collection("athletes").doc(athleteUid);
        let newXp = 0;
        await admin_1.db.runTransaction(async (tx) => {
            const aSnap = await tx.get(athleteRef);
            const curr = (aSnap.exists ? (aSnap.data()?.xp || 0) : 0);
            newXp = curr + inverse;
            tx.set(athleteRef, { xp: admin_1.admin.firestore.FieldValue.increment(inverse), updatedAt: now }, { merge: true });
            const revRef = admin_1.db.collection("xpLogs").doc();
            tx.set(revRef, {
                id: revRef.id,
                parentLogId: logId,
                athleteUid,
                kind: "ADMIN_REVERT",
                bucket: "ADMIN",
                delta: inverse,
                note: note || `Revert of ${logId}`,
                by: req.auth?.uid || "system",
                yyyymm: log.yyyymm || null,
                ts: now,
            });
        });
        return { ok: true, athleteUid, inverse, newXp };
    }
    catch (err) {
        logger_1.logger.error("[revertXpLog] crash:", err);
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError("internal", err?.message || "revert failed");
    }
});
