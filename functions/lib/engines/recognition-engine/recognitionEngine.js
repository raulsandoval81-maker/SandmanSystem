"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateRecognition = evaluateRecognition;
const progressionEngine_1 = require("../progression-engine/progressionEngine");
const recognitionHistory_1 = require("./recognitionHistory");
function evaluateRecognition(athlete) {
    const progression = (0, progressionEngine_1.evaluateProgression)(athlete);
    const tier = Number(athlete.tier || 0);
    const stripe = Number(athlete.stripe ||
        progression?.stripeDecision?.nextStripe ||
        0);
    const stripeAlreadyAwarded = (0, recognitionHistory_1.hasRecognition)(athlete, "STRIPE_AWARD", tier, stripe);
    return {
        stripeAward: {
            type: "STRIPE_AWARD",
            eligible: stripe > 0,
            pending: stripe > 0 && !stripeAlreadyAwarded,
            completed: stripeAlreadyAwarded,
            tier,
            stripe,
            message: stripeAlreadyAwarded
                ? `Stripe ${stripe} already awarded.`
                : `Stripe ${stripe} needs award.`
        },
        nextAction: stripeAlreadyAwarded
            ? "No stripe award pending."
            : `Award Stripe ${stripe}.`
    };
}
