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
        .get();
    if (linkSnap.empty) {
        return {
            ok: true,
            linked: false,
            parentUid,
            athleteId: null,
            athlete: null,
            athletes: [],
        };
    }
    const athleteUids = [
        ...new Set(linkSnap.docs
            .map((doc) => String(doc.data()?.athleteUid || "").trim())
            .filter(Boolean)),
    ];
    if (!athleteUids.length) {
        return {
            ok: true,
            linked: false,
            parentUid,
            athleteId: null,
            athlete: null,
            athletes: [],
        };
    }
    const athletes = [];
    for (const athleteUid of athleteUids) {
        const athleteSnap = await db.collection("athletes").doc(athleteUid).get();
        if (!athleteSnap.exists)
            continue;
        const athlete = athleteSnap.data() || {};
        athletes.push({
            id: athleteSnap.id,
            ...athlete,
        });
    }
    if (!athletes.length) {
        throw new https_1.HttpsError("not-found", "Linked athletes not found.");
    }
    const firstAthlete = athletes[0];
    return {
        ok: true,
        linked: true,
        parentUid,
        // Backward compatible single-athlete fields.
        athleteId: firstAthlete.id,
        athlete: firstAthlete,
        // New family-aware field.
        athletes,
    };
});
