"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateRecognition = evaluateRecognition;
const progressionEngine_1 = require("../progression-engine/progressionEngine");
const legacyEngine_1 = require("../legacy-engine/legacyEngine");
const recognitionHistory_1 = require("./recognitionHistory");
function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}
function isLegacyStripeVetoed(athlete, tier, stripe) {
    const legacy = (0, legacyEngine_1.evaluateLegacy)(athlete);
    if (!legacy.isLegacy)
        return false;
    if (Number(stripe) !== 1)
        return false;
    if (Number(tier) === 0 && legacy.suppressStripe1Tier0)
        return true;
    if (Number(tier) === 1 && legacy.suppressStripe1Tier1)
        return true;
    return false;
}
function hasPassedTesting(athlete) {
    const result = normalizeText(athlete?.testing?.lastTestResult);
    const decision = normalizeText(athlete?.testing?.lastDecision);
    return result === "pass" || decision === "approve";
}
function isTestingPending(athlete) {
    const testing = athlete?.testing || {};
    const state = normalizeText(testing.state);
    const tierStatus = normalizeText(testing.tierStatus);
    if (hasPassedTesting(athlete))
        return false;
    return (Boolean(testing.testEligibleAt) ||
        state === "eligible" ||
        tierStatus === "eligible");
}
function isPromotionPending(athlete) {
    const transitionStatus = normalizeText(athlete?.transition?.status);
    const impact = normalizeText(athlete?.transition?.promotionImpact);
    return (hasPassedTesting(athlete) &&
        (transitionStatus === "pending" ||
            impact.includes("pending")));
}
function isCeremonyPending(athlete) {
    const transitionStatus = normalizeText(athlete?.transition?.status);
    return (hasPassedTesting(athlete) &&
        transitionStatus === "awarded");
}
function evaluateRecognition(athlete) {
    (0, progressionEngine_1.evaluateProgression)(athlete);
    const tier = Number(athlete.tier || 0);
    const stripe = Number(athlete.stripe || 0);
    const legacyVetoed = isLegacyStripeVetoed(athlete, tier, stripe);
    const stripeAlreadyAwarded = (0, recognitionHistory_1.hasRecognition)(athlete, "STRIPE_AWARD", tier, stripe);
    const testingAlreadyCompleted = (0, recognitionHistory_1.hasRecognition)(athlete, "TESTING", tier);
    const promotionAlreadyCompleted = (0, recognitionHistory_1.hasRecognition)(athlete, "PROMOTION", tier);
    const ceremonyAlreadyCompleted = (0, recognitionHistory_1.hasRecognition)(athlete, "CEREMONY", tier);
    const stripePending = stripe > 0 &&
        !stripeAlreadyAwarded &&
        !legacyVetoed;
    const testingPending = isTestingPending(athlete) &&
        !testingAlreadyCompleted;
    const promotionPending = isPromotionPending(athlete) &&
        !promotionAlreadyCompleted;
    const ceremonyPending = isCeremonyPending(athlete) &&
        !ceremonyAlreadyCompleted;
    return {
        stripeAward: {
            type: "STRIPE_AWARD",
            eligible: stripe > 0 && !legacyVetoed,
            pending: stripePending,
            completed: stripeAlreadyAwarded,
            tier,
            stripe,
            message: legacyVetoed
                ? `Legacy placement recognized. Stripe ${stripe} is not awardable in Tier ${tier}.`
                : stripeAlreadyAwarded
                    ? `Stripe ${stripe} already awarded.`
                    : `Stripe ${stripe} needs award.`
        },
        testing: {
            type: "TESTING",
            eligible: isTestingPending(athlete),
            pending: testingPending,
            completed: testingAlreadyCompleted,
            tier,
            message: testingPending
                ? "Testing eligible. Schedule or complete test."
                : testingAlreadyCompleted
                    ? "Testing already completed."
                    : "No testing action needed."
        },
        promotion: {
            type: "PROMOTION",
            eligible: isPromotionPending(athlete),
            pending: promotionPending,
            completed: promotionAlreadyCompleted,
            tier,
            message: promotionPending
                ? "Testing passed. Promotion action pending."
                : promotionAlreadyCompleted
                    ? "Promotion already completed."
                    : "No promotion action needed."
        },
        ceremony: {
            type: "CEREMONY",
            eligible: isCeremonyPending(athlete),
            pending: ceremonyPending,
            completed: ceremonyAlreadyCompleted,
            tier,
            message: ceremonyPending
                ? "Promotion awarded. Ceremony recognition pending."
                : ceremonyAlreadyCompleted
                    ? "Ceremony already completed."
                    : "No ceremony action needed."
        },
        nextAction: stripePending
            ? `Award Stripe ${stripe}.`
            : testingPending
                ? "Testing action pending."
                : promotionPending
                    ? "Promotion action pending."
                    : ceremonyPending
                        ? "Ceremony recognition pending."
                        : legacyVetoed
                            ? `Legacy placement recognized. Stripe ${stripe} is suppressed for Tier ${tier}.`
                            : "No recognition action needed."
    };
}
