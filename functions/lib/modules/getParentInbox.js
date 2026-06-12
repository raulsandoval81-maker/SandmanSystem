"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getParentInbox = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
exports.getParentInbox = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const parentUid = String(req.data?.parentUid || "").trim();
    let query = db
        .collection("parentInbox")
        .orderBy("createdAt", "desc")
        .limit(50);
    const snap = parentUid
        ? await query.where("parentUid", "==", parentUid).get()
        : await query.get();
    return {
        ok: true,
        items: snap.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
            };
        }),
    };
});
