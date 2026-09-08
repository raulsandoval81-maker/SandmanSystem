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
        .get();
    const keepDocs = snap.docs.slice(0, 8);
    const staleDocs = snap.docs.slice(8);
    if (staleDocs.length) {
        for (let i = 0; i < staleDocs.length; i += 400) {
            const batch = db.batch();
            staleDocs
                .slice(i, i + 400)
                .forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        }
    }
    const items = keepDocs.map((doc) => {
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
