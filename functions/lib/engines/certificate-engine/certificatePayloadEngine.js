"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCertificatePayload = buildCertificatePayload;
const progressionEngine_1 = require("../progression-engine/progressionEngine");
function hasIssuedStripeCertificate(athlete, tier, stripe) {
    return (athlete.certificates || []).some((cert) => {
        return (cert.type === "STRIPE" &&
            Number(cert.tier) === Number(tier) &&
            Number(cert.stripe) === Number(stripe));
    });
}
function buildCertificatePayload(athlete) {
    const progression = (0, progressionEngine_1.evaluateProgression)(athlete);
    const stripeDecision = progression.stripeDecision;
    const currentStripe = Number(athlete.stripe || 0);
    if (currentStripe > 0) {
        const alreadyIssued = hasIssuedStripeCertificate(athlete, athlete.tier, currentStripe);
        if (!alreadyIssued) {
            return {
                printReady: true,
                certificateType: "STRIPE",
                title: `Stripe ${currentStripe}`,
                subtitle: stripeDecision.workingTowardBelt,
                athleteName: athlete.name,
                programName: athlete.programName,
                programCode: athlete.programCode,
                tier: athlete.tier,
                stripe: currentStripe,
                trainingShirt: stripeDecision.trainingShirt,
                workingTowardBelt: stripeDecision.workingTowardBelt,
                coach: athlete.coach,
                dateAwarded: new Date().toISOString(),
                message: `${athlete.name} has earned Stripe ${currentStripe}.`
            };
        }
    }
    if (progression.certificateAction === "STRIPE_CERTIFICATE") {
        return {
            printReady: true,
            certificateType: "STRIPE",
            title: `Stripe ${stripeDecision.nextStripe}`,
            subtitle: stripeDecision.workingTowardBelt,
            athleteName: athlete.name,
            programName: athlete.programName,
            programCode: athlete.programCode,
            tier: athlete.tier,
            stripe: stripeDecision.nextStripe,
            trainingShirt: stripeDecision.trainingShirt,
            workingTowardBelt: stripeDecision.workingTowardBelt,
            coach: athlete.coach,
            dateAwarded: new Date().toISOString(),
            message: stripeDecision.message
        };
    }
    if (progression.certificateAction === "TESTING_ELIGIBLE_STRIPE_CERTIFICATE") {
        return {
            printReady: true,
            certificateType: "TESTING_ELIGIBLE_STRIPE",
            title: `Stripe ${stripeDecision.nextStripe}`,
            subtitle: "Testing Eligible",
            athleteName: athlete.name,
            programName: athlete.programName,
            programCode: athlete.programCode,
            tier: athlete.tier,
            stripe: stripeDecision.nextStripe,
            trainingShirt: stripeDecision.trainingShirt,
            workingTowardBelt: stripeDecision.workingTowardBelt,
            coach: athlete.coach,
            dateAwarded: new Date().toISOString(),
            message: stripeDecision.message
        };
    }
    return {
        printReady: false,
        certificateType: "NONE",
        athleteName: athlete.name,
        message: progression.nextAction
    };
}
