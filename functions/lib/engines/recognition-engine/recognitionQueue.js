"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRecognitionQueueFromAthletes = buildRecognitionQueueFromAthletes;
const evaluateRecognition_1 = require("../recognition-engine/evaluateRecognition");
function buildRecognitionQueueFromAthletes(athletes) {
    const queue = {
        stripeAwards: [],
        certificates: [],
        testing: [],
        promotions: [],
        ceremonies: []
    };
    for (const a of athletes) {
        const summary = (0, evaluateRecognition_1.evaluateRecognition)(a);
        const item = {
            athleteUid: a.uid,
            athleteName: a.name || a.fullName,
            decision: summary
        };
        // 🟢 STRIPE
        if (summary.stripeAward?.pending) {
            queue.stripeAwards.push(item);
        }
        // 🟢 CERTIFICATE
        if (summary.certificate?.pending) {
            queue.certificates.push(item);
        }
        // 🟢 TESTING
        if (summary.testing?.pending) {
            queue.testing.push(item);
        }
        // 🟢 PROMOTION
        if (summary.promotion?.pending) {
            queue.promotions.push(item);
        }
        // 🟢 CEREMONY
        if (summary.ceremony?.pending) {
            queue.ceremonies.push(item);
        }
    }
    return queue;
}
