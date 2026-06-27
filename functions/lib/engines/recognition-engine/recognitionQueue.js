"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRecognitionQueue = buildRecognitionQueue;
function buildRecognitionQueue(decisions) {
    return decisions.filter((d) => d.eligible && !d.completed);
}
