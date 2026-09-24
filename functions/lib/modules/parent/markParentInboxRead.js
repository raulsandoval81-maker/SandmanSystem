"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markParentInboxRead = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
exports.markParentInboxRead = (0, https_1.onCall)(async (req) => {
    const parentUid = String(req.auth?.uid || "").trim();
    if (!parentUid) {
        throw new https_1.HttpsError("unauthenticated", "Parent must be signed in.");
    }
    const db = (0, firestore_1.getFirestore)();
    const messageId = String(req.data?.messageId || "").trim();
    if (!messageId) {
        throw new https_1.HttpsError("invalid-argument", "Missing messageId.");
    }
    const messageRef = db
        .collection("parentInbox")
        .doc(messageId);
    const messageSnap = await messageRef.get();
    if (!messageSnap.exists) {
        throw new https_1.HttpsError("not-found", "Parent inbox message not found.");
    }
    const messageParentUid = String(messageSnap.data()?.parentUid || "").trim();
    if (messageParentUid !== parentUid) {
        throw new https_1.HttpsError("permission-denied", "This parent inbox message is outside your authorized scope.");
    }
    await messageRef.update({
        read: true,
        readAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return {
        ok: true,
        messageId,
    };
});
