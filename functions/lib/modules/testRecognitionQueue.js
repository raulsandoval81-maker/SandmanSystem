"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testRecognitionQueue = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const athleteNormalizer_1 = require("../engines/athlete-engine/athleteNormalizer");
const recognitionQueue_1 = require("../engines/recognition-engine/recognitionQueue");
exports.testRecognitionQueue = (0, https_1.onRequest)(async (_req, res) => {
    try {
        const db = (0, firestore_1.getFirestore)();
        const snapshot = await db.collection("athletes").get();
        const athletes = snapshot.docs.map((doc) => (0, athleteNormalizer_1.normalizeAthlete)({
            uid: doc.id,
            ...doc.data()
        }));
        const queue = (0, recognitionQueue_1.buildRecognitionQueueFromAthletes)(athletes);
        res.json({
            ok: true,
            totalAthletes: athletes.length,
            stripeAwards: queue.stripeAwards.length,
            certificates: queue.certificates.length,
            testing: queue.testing.length,
            promotions: queue.promotions.length,
            ceremonies: queue.ceremonies.length,
            queue
        });
    }
    catch (err) {
        res.status(500).json({
            ok: false,
            error: err.message
        });
    }
});
