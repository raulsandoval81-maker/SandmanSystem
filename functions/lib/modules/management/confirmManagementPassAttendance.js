"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmManagementPassAttendance = void 0;
exports.runConfirmManagementPassAttendance = runConfirmManagementPassAttendance;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../../services/staffAuthorization");
const managementPassCheckoutPolicy_1 = require("./managementPassCheckoutPolicy");
async function runConfirmManagementPassAttendance(input, deps) {
    if (!input.authUid)
        throw new https_1.HttpsError("unauthenticated", "Management authentication required.");
    const messageId = String(input.messageId ?? "").trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
        throw new https_1.HttpsError("invalid-argument", "A valid messageId is required.");
    }
    const actor = await deps.loadActor(input.authUid);
    const alreadyConfirmed = await deps.confirm(messageId, actor);
    return { ok: true, messageId, alreadyConfirmed };
}
exports.confirmManagementPassAttendance = (0, https_1.onCall)(async (request) => {
    const db = (0, firestore_1.getFirestore)();
    return runConfirmManagementPassAttendance({
        authUid: request.auth?.uid,
        messageId: request.data?.messageId,
    }, {
        loadActor: (uid) => (0, staffAuthorization_1.requireActiveStaff)(uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Active Management or Admin access required."),
        confirm: async (messageId, actor) => {
            const ref = db.collection("general_messages").doc(messageId);
            return db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                if (!snap.exists)
                    throw new https_1.HttpsError("not-found", "Pass request not found.");
                const message = snap.data() || {};
                (0, managementPassCheckoutPolicy_1.assertManagementPassMessage)(message, actor);
                if (message.passAttendanceConfirmedAt)
                    return true;
                tx.update(ref, {
                    passAttendanceConfirmedAt: firestore_1.FieldValue.serverTimestamp(),
                    passAttendanceConfirmedBy: actor.uid,
                });
                return false;
            });
        },
    });
});
