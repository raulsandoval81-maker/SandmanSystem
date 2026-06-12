"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleTesting = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const createTestingEvent_1 = require("./testing-events/createTestingEvent");
const sendParentSignal_1 = require("./parent/sendParentSignal");
const parentSignalTypes_1 = require("./parent/parentSignalTypes");
exports.scheduleTesting = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const uid = String(req.data?.uid || "").trim();
    const scheduledDate = String(req.data?.scheduledDate || "").trim();
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid");
    }
    if (!scheduledDate) {
        throw new https_1.HttpsError("invalid-argument", "Missing scheduledDate");
    }
    const athleteRef = db.collection("athletes").doc(uid);
    const snap = await athleteRef.get();
    if (!snap.exists) {
        throw new https_1.HttpsError("not-found", "Athlete not found");
    }
    const athlete = snap.data() || {};
    await athleteRef.update({
        "testing.state": "READY",
        "testing.preReadyState": athlete?.testing?.state || null,
        "testing.coachReady": true,
        "testing.scheduledDate": scheduledDate,
        "testing.scheduledAt": firestore_1.FieldValue.serverTimestamp(),
        "testing.coachReadyAt": firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    const athleteName = athlete.publicName ||
        athlete.fullName ||
        null;
    const parentUid = athlete.parentUid || null;
    const eventPayload = {
        uid,
        type: "TEST_SCHEDULED",
        tier: athlete.tier ?? null,
        parentUid,
        publicName: athleteName,
        scheduledDate,
    };
    await (0, createTestingEvent_1.createTestingEvent)(eventPayload);
    if (parentUid) {
        await (0, sendParentSignal_1.sendParentSignal)({
            parentUid,
            athleteId: uid,
            athleteName,
            type: parentSignalTypes_1.PARENT_SIGNAL_TYPES.TEST_SCHEDULED,
            testingDate: scheduledDate,
            source: "scheduleTesting",
            sourceId: uid,
        });
    }
    return {
        ok: true,
        uid,
        scheduledDate,
    };
});
