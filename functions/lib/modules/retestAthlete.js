"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retestAthlete = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const createTestingEvent_1 = require("./testing-events/createTestingEvent");
const createParentSignal_1 = require("./parent/createParentSignal");
const parentSignalTypes_1 = require("./parent/parentSignalTypes");
exports.retestAthlete = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const uid = String(req.data?.uid || "").trim();
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid");
    }
    const athleteRef = db.collection("athletes").doc(uid);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(athleteRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", "Athlete not found");
        }
        const athlete = snap.data() || {};
        const state = String(athlete?.testing?.state || "");
        if (state !== "FREEZE") {
            throw new https_1.HttpsError("failed-precondition", `Athlete must be FREEZE. Current state: ${state}`);
        }
        tx.update(athleteRef, {
            tierStatus: "eligible",
            "testing.state": "ELIGIBLE",
            "testing.freezeUntil": null,
            "testing.cooldownUntil": null,
            "testing.lastTestResult": null,
            "testing.lastTestScore": null,
            "testing.coachReady": false,
            "testing.coachReadyAt": null,
            "testing.testingStartedAt": null,
            "testing.scheduledDate": null,
            "testing.scheduledAt": null,
            "testing.scheduledBy": null,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return {
            uid,
            athleteName: athlete.publicName ||
                athlete.fullName ||
                uid,
            tier: athlete.tier ?? null,
        };
    });
    await (0, createTestingEvent_1.createTestingEvent)({
        uid: result.uid,
        type: "RETEST_READY",
        tier: result.tier,
        publicName: result.athleteName,
    });
    await (0, createParentSignal_1.createParentSignal)({
        athleteId: result.uid,
        athleteName: result.athleteName,
        type: parentSignalTypes_1.PARENT_SIGNAL_TYPES.RETEST_READY,
        source: "retestAthlete",
        sourceId: result.uid,
    });
    return {
        ok: true,
        uid: result.uid,
        state: "ELIGIBLE",
    };
});
