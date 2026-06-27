"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateRecognition = evaluateRecognition;
const progressionEngine_1 = require("../progression-engine/progressionEngine");
const legacyEngine_1 = require("../legacy-engine/legacyEngine");
const recognitionHistory_1 = require("./recognitionHistory");
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
function hasPassedPromotion(athlete) {
    return (athlete?.testing?.lastTestResult === "pass" &&
        !!athlete?.testing?.promotedAt);
}
function evaluateRecognition(athlete) {
    const progression = (0, progressionEngine_1.evaluateProgression)(athlete);
    const tier = Number(athlete.tier || 0);
    const stripe = Number(athlete.stripe || 0);
    const legacyVetoed = isLegacyStripeVetoed(athlete, tier, stripe);
    const stripeAlreadyAwarded = (0, recognitionHistory_1.hasRecognition)(athlete, "STRIPE_AWARD", tier, stripe);
    const stripePending = stripe > 0 &&
        !stripeAlreadyAwarded &&
        !legacyVetoed;
    const ceremonyAlreadyCompleted = (0, recognitionHistory_1.hasRecognition)(athlete, "CEREMONY", tier);
    const ceremonyPending = hasPassedPromotion(athlete) &&
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
        ceremony: {
            type: "CEREMONY",
            eligible: hasPassedPromotion(athlete),
            pending: ceremonyPending,
            completed: ceremonyAlreadyCompleted,
            tier,
            message: ceremonyAlreadyCompleted
                ? "Ceremony already completed."
                : ceremonyPending
                    ? "Promotion passed. Ceremony recognition pending."
                    : "No ceremony recognition pending."
        },
        nextAction: stripePending
            ? `Award Stripe ${stripe}.`
            : ceremonyPending
                ? "Add to ceremony recognition."
                : legacyVetoed
                    ? `Legacy placement recognized. Stripe ${stripe} is suppressed for Tier ${tier}.`
                    : "No recognition action needed."
    };
}
