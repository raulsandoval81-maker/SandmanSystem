"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTestingHistory = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const staffAuthorization_1 = require("../services/staffAuthorization");
exports.getTestingHistory = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.COACH_STAFF_ROLES, "Active Coach access required.");
    const db = (0, firestore_1.getFirestore)();
    const snap = await db
        .collection("testingEvents")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
    const events = [];
    for (const doc of snap.docs) {
        const data = doc.data();
        const athleteId = String(data.uid || data.athleteId || "").trim();
        if (!athleteId)
            continue;
        const athleteSnap = await db.doc(`athletes/${athleteId}`).get();
        if (!athleteSnap.exists)
            continue;
        try {
            (0, staffAuthorization_1.requireCoachAthleteAccess)(actor, athleteSnap.data() || {});
        }
        catch (error) {
            if (error instanceof https_1.HttpsError && error.code === "permission-denied")
                continue;
            throw error;
        }
        events.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
        });
    }
    return {
        ok: true,
        events,
    };
});
