"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateTesting = evaluateTesting;
const testingRequirements_1 = require("./testingRequirements");
function evaluateTesting(athlete) {
    const needed = (0, testingRequirements_1.requiredStripes)(athlete.programCode);
    const eligible = athlete.stripe >= needed;
    return {
        engine: "Sandman Testing Engine",
        eligible,
        athleteId: athlete.uid,
        athleteName: athlete.name,
        currentTier: athlete.tier,
        currentStripe: athlete.stripe,
        passingScore: testingRequirements_1.PASSING_SCORE,
        status: eligible
            ? "READY_FOR_TEST"
            : "NOT_READY",
        nextAction: eligible
            ? "Testing"
            : "Continue earning stripes.",
        coachAction: eligible
            ? "Schedule athlete for testing."
            : "Continue training.",
        message: eligible
            ? `${athlete.name} is eligible to test.`
            : `${athlete.name} needs more stripes before testing.`
    };
}
