"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeParentInbox = writeParentInbox;
const firestore_1 = require("firebase-admin/firestore");
async function writeParentInbox(payload) {
    const db = (0, firestore_1.getFirestore)();
    const { parentUid, athleteId, athleteName, type, title, message, source, sourceId, } = payload;
    if (!parentUid) {
        throw new Error("writeParentInbox: parentUid required");
    }
    const docRef = db.collection("parentInbox").doc();
    await docRef.set({
        parentUid,
        athleteId: athleteId || null,
        athleteName: athleteName || null,
        type,
        title,
        message,
        source: source || null,
        sourceId: sourceId || null,
        read: false,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return docRef.id;
}
