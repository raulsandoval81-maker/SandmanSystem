"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveIntakeCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
exports.approveIntakeCall = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new Error("unauthenticated");
    }
    const { intakeId, approvedUid, note } = req.data;
    if (!intakeId || !approvedUid) {
        throw new Error("missing fields");
    }
    const db = (0, firestore_1.getFirestore)();
    await db.collection("intakes").doc(intakeId).update({
        status: "approved",
        approvedUid,
        approvedAt: new Date(),
        note: note || null,
    });
    return { ok: true };
});
