"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecognitionHistory = getRecognitionHistory;
exports.hasRecognition = hasRecognition;
function getRecognitionHistory(athlete) {
    return athlete.recognitionHistory || [];
}
function hasRecognition(athlete, type, tier, stripe) {
    return getRecognitionHistory(athlete).some((entry) => {
        return (entry.type === type &&
            Number(entry.tier) === Number(tier) &&
            Number(entry.stripe || 0) === Number(stripe || 0));
    });
}
