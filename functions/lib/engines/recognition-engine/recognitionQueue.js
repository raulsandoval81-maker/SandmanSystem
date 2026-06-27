"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRecognitionQueueFromAthletes = buildRecognitionQueueFromAthletes;
const recognitionEngine_1 = require("./recognitionEngine");
function athleteUid(athlete) {
    return athlete.uid || athlete.uidCode || athlete.id || "";
}
function athleteName(athlete) {
    return athlete.name || athlete.fullName || athlete.publicName || athleteUid(athlete);
}
function makeItem(athlete, decision) {
    return {
        athleteUid: athleteUid(athlete),
        athleteName: athleteName(athlete),
        decision
    };
}
function buildRecognitionQueueFromAthletes(athletes) {
    const queue = {
        stripeAwards: [],
        certificates: [],
        testing: [],
        promotions: [],
        ceremonies: []
    };
    athletes.forEach((athlete) => {
        const summary = (0, recognitionEngine_1.evaluateRecognition)(athlete);
        if (summary.stripeAward?.pending) {
            queue.stripeAwards.push(makeItem(athlete, summary.stripeAward));
        }
        if (summary.certificate?.pending) {
            queue.certificates.push(makeItem(athlete, summary.certificate));
        }
        if (summary.testing?.pending) {
            queue.testing.push(makeItem(athlete, summary.testing));
        }
        if (summary.promotion?.pending) {
            queue.promotions.push(makeItem(athlete, summary.promotion));
        }
        if (summary.ceremony?.pending) {
            queue.ceremonies.push(makeItem(athlete, summary.ceremony));
        }
    });
    return queue;
}
