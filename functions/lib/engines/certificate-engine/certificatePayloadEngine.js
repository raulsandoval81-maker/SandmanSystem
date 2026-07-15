"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCertificatePayload = buildCertificatePayload;
const progressionEngine_1 = require("../progression-engine/progressionEngine");
const recognitionEngine_1 = require("../recognition-engine/recognitionEngine");
function normalizeTierNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(0, value);
    }
    const match = String(value ?? "").match(/\d+/);
    return match ? Number(match[0]) : 0;
}
function hasIssuedStripeCertificate(athlete, tier, stripe) {
    return (athlete.certificates || []).some((cert) => {
        return (cert.type === "STRIPE" &&
            normalizeTierNumber(cert.tier) === normalizeTierNumber(tier) &&
            Number(cert.stripe) === Number(stripe));
    });
}
function getLegacyXp(athlete) {
    return Number(athlete?.xpBreakdown?.legacyXp ??
        athlete?.legacyXp ??
        athlete?.placementXp ??
        0);
}
function getLegacyEntryStripe(athlete) {
    const explicit = Number(athlete?.legacyEntryStripe ??
        athlete?.legacy?.entryStripe ??
        athlete?.legacyRecognitionVeto?.entryStripe ??
        0);
    if (explicit > 0) {
        return Math.min(4, Math.max(0, explicit));
    }
    // Compatibility fallback for older legacy records.
    const legacyXp = getLegacyXp(athlete);
    if (legacyXp <= 0)
        return 0;
    const xpCap = Math.max(1, Number(athlete?.xpCap ??
        athlete?.tierCap ??
        1000));
    return Math.min(4, Math.max(0, Math.floor((legacyXp / xpCap) * 4)));
}
function isLegacyAthlete(athlete) {
    return (athlete?.legacyAthlete === true ||
        athlete?.legacy === true ||
        getLegacyXp(athlete) > 0 ||
        getLegacyEntryStripe(athlete) > 0 ||
        athlete?.legacyRecognitionVeto?.enabled === true);
}
function isLegacyStripeVetoed(athlete, tier, stripe) {
    if (!isLegacyAthlete(athlete))
        return false;
    const normalizedTier = normalizeTierNumber(tier);
    const normalizedStripe = Number(stripe);
    if (normalizedStripe <= 0)
        return false;
    const veto = athlete?.legacyRecognitionVeto;
    const tierRule = veto?.tiers?.[String(normalizedTier)] ??
        veto?.tiers?.[normalizedTier];
    // Explicit per-tier configuration wins.
    if (veto?.enabled === true && tierRule) {
        const highestVetoedStripe = Number(tierRule.highestVetoedStripe ??
            (tierRule.stripe1Vetoed === true ? 1 : 0));
        return normalizedStripe <= highestVetoedStripe;
    }
    // Default doctrine:
    // inherited placement is recognized, not ceremonially awarded.
    const entryTier = normalizeTierNumber(athlete?.legacyEntryTier ??
        athlete?.legacy?.entryTier ??
        0);
    if (normalizedTier !== entryTier)
        return false;
    const legacyEntryStripe = getLegacyEntryStripe(athlete);
    return normalizedStripe <= legacyEntryStripe;
}
function notReady(athlete, message, reason = "NOT_READY") {
    return {
        printReady: false,
        ceremonyEligible: false,
        certificateType: "NONE",
        reason,
        athleteName: athlete.name,
        message
    };
}
function stripePayload(athlete, stripeDecision, certificateType, title, subtitle, stripe, message) {
    return {
        printReady: true,
        ceremonyEligible: true,
        certificateType,
        reason: null,
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
    const recognition = (0, recognitionEngine_1.evaluateRecognition)(athlete);
    const stripeDecision = progression.stripeDecision;
    const currentStripe = Number(athlete.stripe || 0);
    const currentTier = normalizeTierNumber(athlete.tier);
    if (currentStripe > 0) {
        if (isLegacyStripeVetoed(athlete, currentTier, currentStripe)) {
            return notReady(athlete, "Legacy placement recognized. Certificates begin with the first stripe earned in Sandman.", "LEGACY_PLACEMENT");
        }
        const alreadyIssued = hasIssuedStripeCertificate(athlete, currentTier, currentStripe);
        if (!recognition.stripeAward?.eligible) {
            return notReady(athlete, recognition.nextAction, "RECOGNITION_NOT_ELIGIBLE");
        }
        if (recognition.stripeAward?.completed) {
            return notReady(athlete, recognition.stripeAward.message, "CERTIFICATE_ALREADY_COMPLETED");
        }
        if (!alreadyIssued) {
            return stripePayload(athlete, stripeDecision, "STRIPE", `Stripe ${currentStripe}`, stripeDecision?.workingTowardBelt || "Next Belt", currentStripe, `${athlete.name} has earned Stripe ${currentStripe}.`);
        }
    }
    if (progression.certificateAction === "STRIPE_CERTIFICATE") {
        const nextStripe = Number(stripeDecision?.nextStripe || 0);
        if (isLegacyStripeVetoed(athlete, currentTier, nextStripe)) {
            return notReady(athlete, "Legacy placement recognized. Certificates begin with the first stripe earned in Sandman.", "LEGACY_PLACEMENT");
        }
        return stripePayload(athlete, stripeDecision, "STRIPE", `Stripe ${nextStripe}`, stripeDecision?.workingTowardBelt || "Next Belt", nextStripe, stripeDecision?.message || "Stripe certificate ready.");
    }
    if (progression.certificateAction ===
        "TESTING_ELIGIBLE_STRIPE_CERTIFICATE") {
        const nextStripe = Number(stripeDecision?.nextStripe || 0);
        if (isLegacyStripeVetoed(athlete, currentTier, nextStripe)) {
            return notReady(athlete, "Legacy placement recognized. Testing recognition opens after deeper Sandman-earned progress is recorded.", "LEGACY_PLACEMENT");
        }
        return stripePayload(athlete, stripeDecision, "TESTING_ELIGIBLE_STRIPE", `Stripe ${nextStripe}`, "Testing Eligible", nextStripe, stripeDecision?.message ||
            "Testing eligible stripe certificate ready.");
    }
    return notReady(athlete, progression.nextAction || "No certificate ready.");
}
