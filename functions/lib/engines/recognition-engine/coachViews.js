"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCoachViews = buildCoachViews;
/**
 * Splits raw recognition queue into coach-readable operational layers
 */
function buildCoachViews(queue) {
    return {
        // 🟡 READINESS (WHO IS APPROACHING A DECISION)
        readiness: [
            ...queue.testing,
        ],
        // 🔵 ACTION (WHAT COACH MUST ACT ON)
        action: [
            ...queue.promotions,
            ...queue.testing,
        ],
        // 🟢 REWARD (WHAT HAS BEEN EARNED / COMPLETED)
        reward: [
            ...queue.stripeAwards,
            ...queue.certificates,
            ...queue.ceremonies,
        ]
    };
}
