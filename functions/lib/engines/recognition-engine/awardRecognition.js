"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.awardRecognition = awardRecognition;
function awardRecognition(request) {
    return {
        type: request.type,
        tier: request.tier,
        stripe: request.stripe,
        date: new Date().toISOString(),
        coach: request.coachUid
    };
}
