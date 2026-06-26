"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateProgression = evaluateProgression;
const stripeEngine_1 = require("../stripe-engine/stripeEngine");
const promotionEngine_1 = require("../promotion-engine/promotionEngine");
function evaluateProgression(athlete) {
    const stripeDecision = (0, stripeEngine_1.evaluateStripe)(athlete);
    const promotionDecision = (0, promotionEngine_1.evaluatePromotion)(athlete);
    if (stripeDecision.status === "STRIPE_CERTIFICATE_READY") {
        return {
            engine: "Sandman Progression Engine",
            athleteId: athlete.id,
            athleteName: athlete.name,
            state: "STRIPE_CERTIFICATE_READY",
            nextAction: `Generate Stripe ${stripeDecision.nextStripe} Certificate`,
            coachAction: "Print stripe certificate.",
            certificateAction: "STRIPE_CERTIFICATE",
            testingAction: "NO_TEST_YET",
            ceremonyAction: "NO_CEREMONY_ACTION",
            stripeDecision,
            promotionDecision
        };
    }
    if (stripeDecision.status === "TESTING_ELIGIBLE_STRIPE_READY") {
        return {
            engine: "Sandman Progression Engine",
            athleteId: athlete.id,
            athleteName: athlete.name,
            state: "TESTING_ELIGIBLE_STRIPE_READY",
            nextAction: `Generate Stripe ${stripeDecision.nextStripe} Testing Eligibility Certificate`,
            coachAction: "Print testing eligibility stripe certificate, then schedule test.",
            certificateAction: "TESTING_ELIGIBLE_STRIPE_CERTIFICATE",
            testingAction: "SCHEDULE_TEST",
            ceremonyAction: "NO_CEREMONY_ACTION",
            stripeDecision,
            promotionDecision
        };
    }
    if (stripeDecision.status === "FULLY_STRIPED") {
        return {
            engine: "Sandman Progression Engine",
            athleteId: athlete.id,
            athleteName: athlete.name,
            state: "READY_FOR_TESTING",
            nextAction: "Schedule test.",
            coachAction: "Schedule or record test score.",
            certificateAction: "NO_CERTIFICATE",
            testingAction: "READY_FOR_TESTING",
            ceremonyAction: "NO_CEREMONY_ACTION",
            stripeDecision,
            promotionDecision
        };
    }
    if (stripeDecision.status === "NOT_READY") {
        return {
            engine: "Sandman Progression Engine",
            athleteId: athlete.id,
            athleteName: athlete.name,
            state: "NOT_READY",
            nextAction: "Continue training.",
            coachAction: "Keep logging attendance and XP.",
            certificateAction: "NO_CERTIFICATE",
            testingAction: "NO_TEST_YET",
            ceremonyAction: "NO_CEREMONY_ACTION",
            stripeDecision,
            promotionDecision
        };
    }
    return {
        engine: "Sandman Progression Engine",
        athleteId: athlete.id,
        athleteName: athlete.name,
        state: "ERROR",
        nextAction: "Review athlete record.",
        coachAction: "Check program, tier, stripe, and XP data.",
        certificateAction: "NO_CERTIFICATE",
        testingAction: "NO_TEST_YET",
        ceremonyAction: "NO_CEREMONY_ACTION",
        stripeDecision,
        promotionDecision
    };
}
