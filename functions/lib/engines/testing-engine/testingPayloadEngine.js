"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTestingPayload = buildTestingPayload;
const testingEngine_1 = require("./testingEngine");
function buildTestingPayload(athlete) {
    const decision = (0, testingEngine_1.evaluateTesting)(athlete);
    return {
        printReady: decision.eligible,
        decision
    };
}
