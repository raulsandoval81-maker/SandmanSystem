"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePromotion = evaluatePromotion;
const promotionStatus_1 = require("./promotionStatus");
const stripeStatus_1 = require("../stripe-engine/stripeStatus");
function evaluatePromotion(athlete) {
    const status = (0, promotionStatus_1.getPromotionStatus)(athlete);
    const stripeStatus = (0, stripeStatus_1.getStripeStatus)(athlete);
    const fullyStriped = stripeStatus.status === "FULLY_STRIPED";
    if (status.status === "TESTING_ELIGIBLE" && fullyStriped) {
        return {
            approved: false,
            athleteId: athlete.id,
            athleteName: athlete.name,
            status: "TESTING_ELIGIBLE",
            trainingShirt: status.trainingShirt,
            workingTowardBelt: status.workingTowardBelt,
            earnedBeltAfterPass: status.earnedBeltAfterPass,
            xp: status.xp,
            threshold: status.threshold,
            remaining: status.remaining,
            testRequired: true,
            passingScore: 85,
            ceremonyRequired: true,
            message: `${athlete.name} is fully striped and testing eligible for ${status.workingTowardBelt}. Must pass with 85% or higher.`,
            certificateReady: false,
            testReady: true
        };
    }
    if (status.status === "TESTING_ELIGIBLE" && !fullyStriped) {
        return {
            approved: false,
            athleteId: athlete.id,
            athleteName: athlete.name,
            status: "NOT_READY",
            trainingShirt: status.trainingShirt,
            workingTowardBelt: status.workingTowardBelt,
            earnedBeltAfterPass: status.earnedBeltAfterPass,
            xp: status.xp,
            threshold: status.threshold,
            remaining: 0,
            testRequired: false,
            passingScore: 85,
            ceremonyRequired: false,
            message: `${athlete.name} has enough XP but must finish all stripes before testing.`,
            certificateReady: false,
            testReady: false
        };
    }
    if (status.status === "NOT_READY") {
        return {
            approved: false,
            athleteId: athlete.id,
            athleteName: athlete.name,
            status: "NOT_READY",
            trainingShirt: status.trainingShirt,
            workingTowardBelt: status.workingTowardBelt,
            earnedBeltAfterPass: status.earnedBeltAfterPass,
            xp: status.xp,
            threshold: status.threshold,
            remaining: status.remaining,
            testRequired: false,
            passingScore: 85,
            ceremonyRequired: false,
            message: `${athlete.name} needs ${status.remaining} more XP before stripe progression.`,
            certificateReady: false,
            testReady: false
        };
    }
    return {
        approved: false,
        athleteId: athlete.id,
        athleteName: athlete.name,
        status: "ERROR",
        xp: athlete.xp,
        threshold: 0,
        remaining: 0,
        testRequired: false,
        passingScore: 85,
        ceremonyRequired: false,
        message: "Promotion status could not be determined.",
        certificateReady: false,
        testReady: false
    };
}
