"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParentInbox = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
exports.getParentInbox = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const parentUid = req.auth?.uid || "";
    if (!parentUid) {
        throw new https_1.HttpsError("unauthenticated", "Parent must be signed in.");
    }
    const snap = await db
        .collection("parentInbox")
        .where("parentUid", "==", parentUid)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
    const items = snap.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            read: data.read === true,
            createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
        };
    });
    const unreadCount = items.filter((item) => item.read !== true).length;
    return {
        ok: true,
        parentUid,
        unreadCount,
        items,
    };
});
