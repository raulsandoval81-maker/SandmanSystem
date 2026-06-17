"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveCoachNote = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const createParentSignal_1 = require("./createParentSignal");
const parentSignalTypes_1 = require("./parentSignalTypes");
exports.saveCoachNote = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const uid = String(req.data?.uid || "").trim();
    const note = String(req.data?.note || "").trim();
    const coachName = String(req.data?.coachName || "Coach").trim();
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid");
    }
    if (!note) {
        throw new https_1.HttpsError("invalid-argument", "Missing note");
    }
    if (note.length > 500) {
        throw new https_1.HttpsError("invalid-argument", "Coach note is too long");
    }
    const athleteRef = db.collection("athletes").doc(uid);
    const snap = await athleteRef.get();
    if (!snap.exists) {
        throw new https_1.HttpsError("not-found", "Athlete not found");
    }
    const athlete = snap.data() || {};
    const athleteName = athlete.publicName ||
        athlete.fullName ||
        null;
    const noteRef = db.collection("coachNotes").doc();
    await noteRef.set({
        uid,
        athleteId: uid,
        athleteName,
        note,
        coachName,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        source: "coach",
        visibleToParent: true,
    });
    await athleteRef.set({
        latestCoachNote: {
            note,
            coachName,
            noteId: noteRef.id,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        },
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, {
        merge: true,
    });
    const signalResult = await (0, createParentSignal_1.createParentSignal)({
        athleteId: uid,
        athleteName,
        type: parentSignalTypes_1.PARENT_SIGNAL_TYPES.COACH_NOTE,
        note,
        source: "saveCoachNote",
        sourceId: noteRef.id,
    });
    return {
        ok: true,
        uid,
        noteId: noteRef.id,
        parentSignal: signalResult,
    };
});
