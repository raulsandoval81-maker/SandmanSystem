"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistRecognitionAward = persistRecognitionAward;
const firestore_1 = require("firebase-admin/firestore");
const awardRecognition_1 = require("../engines/recognition-engine/awardRecognition");
async function persistRecognitionAward(request) {
    if (!request.athleteUid) {
        throw new Error("Missing athleteUid.");
    }
    const db = (0, firestore_1.getFirestore)();
    const athleteRef = db.collection("athletes").doc(request.athleteUid);
    const event = (0, awardRecognition_1.awardRecognition)(request);
    await athleteRef.update({
        recognitionHistory: firestore_1.FieldValue.arrayUnion(event),
        updatedAt: firestore_1.FieldValue.serverTimestamp()
    });
    return {
        ok: true,
        athleteUid: request.athleteUid,
        event
    };
}
