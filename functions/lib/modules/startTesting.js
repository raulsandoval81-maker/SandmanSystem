"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTesting = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const createTestingEvent_1 = require("./testing-events/createTestingEvent");
const createParentSignal_1 = require("./parent/createParentSignal");
exports.startTesting = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const uid = String(req.data?.uid || "").trim();
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid");
    }
    const athleteRef = db.collection("athletes").doc(uid);
    const snap = await athleteRef.get();
    if (!snap.exists) {
        throw new https_1.HttpsError("not-found", "Athlete not found");
    }
    const athlete = snap.data() || {};
    await athleteRef.update({
        "testing.state": "TESTING",
        "testing.testingStartedAt": firestore_1.FieldValue.serverTimestamp(),
        "testing.lastTestResult": null,
        "testing.freezeUntil": null,
        "testing.cooldownUntil": null,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    const athleteName = athlete.publicName ||
        athlete.fullName ||
        uid;
    const parentUid = athlete.parentUid || null;
    const eventPayload = {
        uid,
        type: "TEST_STARTED",
        tier: athlete.tier ?? null,
        parentUid,
        publicName: athleteName,
    };
    await (0, createTestingEvent_1.createTestingEvent)(eventPayload);
    await (0, createParentSignal_1.createParentSignal)({
        athleteId: uid,
        athleteName,
        type: createParentSignal_1.PARENT_SIGNAL_TYPES.TEST_STARTED,
        source: "startTesting",
        sourceId: uid,
    });
    return {
        ok: true,
        uid,
    };
});
