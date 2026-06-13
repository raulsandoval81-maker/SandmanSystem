"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyAthlete = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
exports.getMyAthlete = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const parentUid = req.auth?.uid || "";
    if (!parentUid) {
        throw new https_1.HttpsError("unauthenticated", "Parent must be signed in.");
    }
    const linkSnap = await db
        .collection("parentAthleteLinks")
        .where("parentUid", "==", parentUid)
        .where("status", "==", "active")
        .limit(1)
        .get();
    if (linkSnap.empty) {
        return {
            ok: true,
            linked: false,
            athlete: null,
            parentUid,
        };
    }
    const link = linkSnap.docs[0].data() || {};
    const athleteUid = String(link.athleteUid || "").trim();
    if (!athleteUid) {
        throw new https_1.HttpsError("failed-precondition", "Parent link is missing athleteUid.");
    }
    const athleteRef = db.collection("athletes").doc(athleteUid);
    const athleteSnap = await athleteRef.get();
    if (!athleteSnap.exists) {
        throw new https_1.HttpsError("not-found", "Linked athlete not found.");
    }
    const athlete = athleteSnap.data() || {};
    return {
        ok: true,
        linked: true,
        parentUid,
        athleteId: athleteSnap.id,
        athlete: {
            id: athleteSnap.id,
            ...athlete,
        },
    };
});
