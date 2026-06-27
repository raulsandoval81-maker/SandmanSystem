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
function getLegacyXp(athlete) {
    return Number(athlete?.xpBreakdown?.legacyXp ??
        athlete?.legacyXp ??
        athlete?.placementXp ??
        0);
}
function shouldSuppressLegacyStripeCertificate(athlete, stripe) {
    const legacyXp = getLegacyXp(athlete);
    if (legacyXp <= 0)
        return false;
    // Legacy athletes do not receive Stripe I certificate from placement.
    return Number(stripe) < 2;
}
function notReady(athlete, message) {
    return {
        printReady: false,
        certificateType: "NONE",
        athleteName: athlete.name,
        message
    };
}
function stripePayload(athlete, stripeDecision, certificateType, title, subtitle, stripe, message) {
    return {
        printReady: true,
        certificateType,
        title,
        subtitle,
        athleteName: athlete.name,
        programName: athlete.programName,
        programCode: athlete.programCode,
        tier: athlete.tier,
        stripe,
        trainingShirt: stripeDecision.trainingShirt,
        workingTowardBelt: stripeDecision.workingTowardBelt,
        coach: athlete.coach,
        dateAwarded: new Date().toISOString(),
        message
    };
}
function buildCertificatePayload(athlete) {
    const progression = (0, progressionEngine_1.evaluateProgression)(athlete);
    const stripeDecision = progression.stripeDecision;
    const currentStripe = Number(athlete.stripe || 0);
    if (currentStripe > 0) {
        if (shouldSuppressLegacyStripeCertificate(athlete, currentStripe)) {
            return notReady(athlete, "Legacy placement recognized. Stripe certificate opens at Stripe II.");
        }
        const alreadyIssued = hasIssuedStripeCertificate(athlete, athlete.tier, currentStripe);
        if (!alreadyIssued) {
            return stripePayload(athlete, stripeDecision, "STRIPE", `Stripe ${currentStripe}`, stripeDecision?.workingTowardBelt || "Next Belt", currentStripe, `${athlete.name} has earned Stripe ${currentStripe}.`);
        }
    }
    if (progression.certificateAction === "STRIPE_CERTIFICATE") {
        const nextStripe = Number(stripeDecision.nextStripe);
        if (shouldSuppressLegacyStripeCertificate(athlete, nextStripe)) {
            return notReady(athlete, "Legacy placement recognized. Stripe certificate opens at Stripe II.");
        }
        return stripePayload(athlete, stripeDecision, "STRIPE", `Stripe ${nextStripe}`, stripeDecision?.workingTowardBelt || "Next Belt", nextStripe, stripeDecision.message);
    }
    if (progression.certificateAction === "TESTING_ELIGIBLE_STRIPE_CERTIFICATE") {
        const nextStripe = Number(stripeDecision.nextStripe);
        return stripePayload(athlete, stripeDecision, "TESTING_ELIGIBLE_STRIPE", `Stripe ${nextStripe}`, "Testing Eligible", nextStripe, stripeDecision.message);
    }
    return notReady(athlete, progression.nextAction);
}
