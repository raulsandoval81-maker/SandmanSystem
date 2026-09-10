"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAthleteScheduleScope = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const crossTrainingPolicy_1 = require("./crossTrainingPolicy");
const db = (0, firestore_1.getFirestore)();
exports.getAthleteScheduleScope = (0, https_1.onCall)(async (req) => {
    const callerUid = String(req.auth?.uid || "").trim();
    const athleteId = String(req.data?.athleteId || "").trim().toUpperCase();
    if (!callerUid)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    if (!athleteId)
        throw new https_1.HttpsError("invalid-argument", "athleteId required.");
    const athleteSnap = await db.doc(`athletes/${athleteId}`).get();
    if (!athleteSnap.exists)
        throw new https_1.HttpsError("not-found", "Athlete not found.");
    const athlete = athleteSnap.data() || {};
    let activeParentUids = [];
    if (String(athlete.authUid || "").trim() !== callerUid) {
        const parentLinks = await db.collection("parentAthleteLinks")
            .where("parentUid", "==", callerUid)
            .where("athleteUid", "==", athleteId)
            .where("status", "==", "active")
            .limit(1)
            .get();
        activeParentUids = parentLinks.docs.map((item) => String(item.data()?.parentUid || "").trim());
        // Legacy compatibility for athletes activated before the
        // canonical parentAthleteLinks relationship existed.
        if (!activeParentUids.length &&
            String(athlete.parentUid || "").trim() === callerUid) {
            activeParentUids = [callerUid];
        }
    }
    if (!(0, crossTrainingPolicy_1.canReadAthleteScheduleScope)(callerUid, athlete.authUid, activeParentUids)) {
        throw new https_1.HttpsError("permission-denied", "Athlete schedule access denied.");
    }
    const assignmentsSnap = await db.collection("athleteCrossTrainingAssignments")
        .where("athleteId", "==", athleteId)
        .get();
    return {
        ok: true,
        athleteId,
        homeLocationId: (0, crossTrainingPolicy_1.athleteHomeLocationId)(athlete),
        assignments: assignmentsSnap.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((item) => String(item.status || "").toLowerCase() === "active"),
    };
});
