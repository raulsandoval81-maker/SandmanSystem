"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.freezeAthlete = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const createTestingEvent_1 = require("./testing-events/createTestingEvent");
const createParentSignal_1 = require("./parent/createParentSignal");
exports.freezeAthlete = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const payload = req.data || {};
    const uid = String(payload.uid || "").trim();
    const score = Number(payload.score || 0);
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid");
    }
    if (!Number.isFinite(score) ||
        score < 0 ||
        score > 100) {
        throw new https_1.HttpsError("invalid-argument", "Invalid score");
    }
    if (score >= 85) {
        throw new https_1.HttpsError("failed-precondition", "Score is 85 or higher. Use Pass Test.");
    }
    const athleteRef = db.collection("athletes").doc(uid);
    const freezeUntil = new Date();
    freezeUntil.setDate(freezeUntil.getDate() + 5);
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(athleteRef);
        if (!snap.exists) {
            throw new https_1.HttpsError("not-found", `Athlete not found: ${uid}`);
        }
        const athlete = snap.data() || {};
        const testingState = String(athlete?.testing?.state || "");
        if (testingState !== "TESTING") {
            throw new https_1.HttpsError("failed-precondition", `Athlete must be TESTING before freeze. Current state: ${testingState}`);
        }
        tx.update(athleteRef, {
            tierStatus: "freeze",
            "testing.state": "FREEZE",
            "testing.lastTestResult": "fail",
            "testing.lastTestScore": score,
            "testing.passingScore": 85,
            "testing.freezeUntil": freezeUntil,
            "testing.cooldownUntil": null,
            "testing.testingStartedAt": null,
            "testing.coachReady": false,
            "testing.coachReadyAt": null,
            "testing.scheduledDate": null,
            "testing.scheduledAt": null,
            "testing.scheduledBy": null,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return {
            ok: true,
            uid,
            score,
            state: "FREEZE",
            freezeUntil: freezeUntil.toISOString(),
            tier: athlete.tier ?? null,
            parentUid: athlete.parentUid ?? null,
            publicName: athlete.publicName ??
                athlete.fullName ??
                uid,
        };
    });
    if (result.ok) {
        const eventPayload = {
            uid: result.uid,
            type: "TEST_FAILED",
            score: result.score,
            tier: result.tier,
            parentUid: result.parentUid,
            publicName: result.publicName,
        };
        await (0, createTestingEvent_1.createTestingEvent)(eventPayload);
        await (0, createParentSignal_1.createParentSignal)({
            athleteId: result.uid,
            athleteName: result.publicName,
            type: createParentSignal_1.PARENT_SIGNAL_TYPES.TEST_FAILED,
            source: "freezeAthlete",
            sourceId: result.uid,
        });
        await (0, createParentSignal_1.createParentSignal)({
            athleteId: result.uid,
            athleteName: result.publicName,
            type: createParentSignal_1.PARENT_SIGNAL_TYPES.TEST_FREEZE,
            source: "freezeAthlete",
            sourceId: result.uid,
        });
    }
    return result;
});
