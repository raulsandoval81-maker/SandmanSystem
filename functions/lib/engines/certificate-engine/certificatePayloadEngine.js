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
function isLegacyStripeVetoed(athlete, tier, stripe) {
    if (getLegacyXp(athlete) <= 0)
        return false;
    if (Number(stripe) !== 1)
        return false;
    const veto = athlete?.legacyRecognitionVeto;
    if (veto?.enabled === true) {
        return (veto?.tiers?.[String(tier)]?.stripe1Vetoed === true ||
            veto?.tiers?.[Number(tier)]?.stripe1Vetoed === true);
    }
    // fallback rule for older legacy records:
    // legacy athletes do not receive Stripe I certificate in Tier 0 or Tier 1
    return Number(tier) === 0 || Number(tier) === 1;
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
        trainingShirt: stripeDecision?.trainingShirt || "",
        workingTowardBelt: stripeDecision?.workingTowardBelt || "Next Belt",
        coach: athlete.coach,
        dateAwarded: new Date().toISOString(),
        message
    };
}
function buildCertificatePayload(athlete) {
    const progression = (0, progressionEngine_1.evaluateProgression)(athlete);
    const stripeDecision = progression.stripeDecision;
    const currentStripe = Number(athlete.stripe || 0);
    const currentTier = Number(athlete.tier || 0);
    if (currentStripe > 0) {
        if (isLegacyStripeVetoed(athlete, currentTier, currentStripe)) {
            return notReady(athlete, "Legacy placement recognized. Stripe I certificate is vetoed for this tier; recognition opens after deeper Sandman-earned progress.");
        }
        const alreadyIssued = hasIssuedStripeCertificate(athlete, currentTier, currentStripe);
        if (!alreadyIssued) {
            return stripePayload(athlete, stripeDecision, "STRIPE", `Stripe ${currentStripe}`, stripeDecision?.workingTowardBelt || "Next Belt", currentStripe, `${athlete.name} has earned Stripe ${currentStripe}.`);
        }
    }
    if (progression.certificateAction === "STRIPE_CERTIFICATE") {
        const nextStripe = Number(stripeDecision?.nextStripe || 0);
        if (isLegacyStripeVetoed(athlete, currentTier, nextStripe)) {
            return notReady(athlete, "Legacy placement recognized. Stripe I certificate is vetoed for this tier; recognition opens after deeper Sandman-earned progress.");
        }
        return stripePayload(athlete, stripeDecision, "STRIPE", `Stripe ${nextStripe}`, stripeDecision?.workingTowardBelt || "Next Belt", nextStripe, stripeDecision?.message || "Stripe certificate ready.");
    }
    if (progression.certificateAction === "TESTING_ELIGIBLE_STRIPE_CERTIFICATE") {
        const nextStripe = Number(stripeDecision?.nextStripe || 0);
        if (isLegacyStripeVetoed(athlete, currentTier, nextStripe)) {
            return notReady(athlete, "Legacy placement recognized. Testing certificate is blocked until deeper Sandman-earned progress is recorded.");
        }
        return stripePayload(athlete, stripeDecision, "TESTING_ELIGIBLE_STRIPE", `Stripe ${nextStripe}`, "Testing Eligible", nextStripe, stripeDecision?.message || "Testing eligible stripe certificate ready.");
    }
    return notReady(athlete, progression.nextAction || "No certificate ready.");
}
