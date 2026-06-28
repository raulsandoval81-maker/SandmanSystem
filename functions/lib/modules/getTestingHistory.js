"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTestingHistory = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
exports.getTestingHistory = (0, https_1.onCall)(async () => {
    const db = (0, firestore_1.getFirestore)();
    const snap = await db
        .collection("testingEvents")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
    return {
        ok: true,
        events: snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.().toISOString?.() ?? null,
        })),
    };
});
