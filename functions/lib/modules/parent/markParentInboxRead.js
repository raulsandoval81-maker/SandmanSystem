"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markParentInboxRead = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
exports.markParentInboxRead = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const messageId = String(req.data?.messageId || "").trim();
    if (!messageId) {
        return {
            ok: false,
            error: "Missing messageId",
        };
    }
    await db
        .collection("parentInbox")
        .doc(messageId)
        .set({
        read: true,
        readAt: firestore_1.FieldValue.serverTimestamp(),
    }, {
        merge: true,
    });
    return {
        ok: true,
        messageId,
    };
});
