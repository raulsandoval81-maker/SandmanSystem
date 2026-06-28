"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testRecognitionQueue = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const coachViews_1 = require("../engines/recognition-engine/coachViews");
const athleteNormalizer_1 = require("../engines/athlete-engine/athleteNormalizer");
const resolveAthleteStage_1 = require("../engines/recognition-engine/resolveAthleteStage");
const recognitionQueue_1 = require("../engines/recognition-engine/recognitionQueue");
exports.testRecognitionQueue = (0, https_1.onRequest)(async (_req, res) => {
    try {
        const db = (0, firestore_1.getFirestore)();
        const snapshot = await db.collection("athletes").get();
        const athletes = snapshot.docs
            .map((doc) => (0, athleteNormalizer_1.normalizeAthlete)({
            uid: doc.id,
            ...doc.data()
        }))
            .filter((a) => {
            if (a.rosterStatus !== "current")
                return false;
            if (a.isDev || a.devMode || a.isTest)
                return false;
            return true;
        });
        // 🟡 OLD SYSTEM (baseline)
        const legacyQueue = (0, recognitionQueue_1.buildRecognitionQueueFromAthletes)(athletes);
        // 🟢 NEW SYSTEM (manual stage-driven queue)
        const queue = {
            stripeAwards: [],
            certificates: [], // ✅ FIXED (required by type)
            testing: [],
            promotions: [],
            ceremonies: []
        };
        for (const athlete of athletes) {
            const stage = (0, resolveAthleteStage_1.resolveAthleteStage)(athlete);
            const item = {
                athleteUid: athlete.uid,
                athleteName: athlete.name || athlete.fullName,
                stage,
                decision: {
                    tier: athlete.tier,
                    stripe: athlete.stripeCount ?? athlete.stripe ?? 0
                }
            };
            switch (stage) {
                case "STRIPE_PROGRESS":
                    queue.stripeAwards.push(item);
                    break;
                case "TEST_ELIGIBLE":
                case "TEST_SCHEDULED":
                case "TESTING":
                case "TEMPLE":
                    queue.testing.push(item);
                    break;
                case "PROMOTION":
                    queue.promotions.push(item);
                    break;
                case "CEREMONY":
                    queue.ceremonies.push(item);
                    break;
                case "COOLDOWN":
                case "DONE":
                    break;
                default:
                    console.warn("Unknown stage:", stage, athlete.uid);
            }
        }
        // 🟣 COACH VIEWS (SAFE — AFTER QUEUE EXISTS)
        const coachViews = (0, coachViews_1.buildCoachViews)(queue);
        res.json({
            ok: true,
            totalAthletes: athletes.length,
            legacy: {
                stripeAwards: legacyQueue.stripeAwards.length,
                certificates: legacyQueue.certificates.length,
                testing: legacyQueue.testing.length,
                promotions: legacyQueue.promotions.length,
                ceremonies: legacyQueue.ceremonies.length
            },
            system: {
                stripeAwards: queue.stripeAwards.length,
                certificates: queue.certificates.length,
                testing: queue.testing.length,
                promotions: queue.promotions.length,
                ceremonies: queue.ceremonies.length
            },
            queue,
            coachViews
        });
    }
    catch (err) {
        res.status(500).json({
            ok: false,
            error: err.message
        });
    }
});
