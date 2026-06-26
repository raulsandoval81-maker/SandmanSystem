"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPromotionStatus = getPromotionStatus;
const programThresholds_1 = require("./programThresholds");
function getPromotionStatus(athlete) {
    const program = programThresholds_1.PROGRAM_THRESHOLDS[athlete.programCode];
    if (!program) {
        return {
            status: "ERROR",
            xp: athlete.xp,
            threshold: 0,
            remaining: 0,
            testRequired: false,
            passingScore: 85,
            ceremonyRequired: false
        };
    }
    const tier = program.tiers.find(t => t.tier === athlete.tier);
    if (!tier) {
        return {
            status: "ERROR",
            xp: athlete.xp,
            threshold: 0,
            remaining: 0,
            testRequired: false,
            passingScore: 85,
            ceremonyRequired: false
        };
    }
    if (athlete.xp >= tier.xp) {
        return {
            status: "TESTING_ELIGIBLE",
            trainingShirt: tier.trainingShirt,
            workingTowardBelt: tier.workingTowardBelt,
            earnedBeltAfterPass: tier.earnedBeltAfterPass,
            xp: athlete.xp,
            threshold: tier.xp,
            remaining: 0,
            testRequired: true,
            passingScore: 85,
            ceremonyRequired: true
        };
    }
    return {
        status: "NOT_READY",
        trainingShirt: tier.trainingShirt,
        workingTowardBelt: tier.workingTowardBelt,
        earnedBeltAfterPass: tier.earnedBeltAfterPass,
        xp: athlete.xp,
        threshold: tier.xp,
        remaining: tier.xp - athlete.xp,
        testRequired: false,
        passingScore: 85,
        ceremonyRequired: false
    };
}
