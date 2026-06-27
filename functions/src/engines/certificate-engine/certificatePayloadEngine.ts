import { EngineAthlete } from "../athlete-engine/athleteNormalizer";
import { evaluateProgression } from "../progression-engine/progressionEngine";
import { evaluateRecognition } from "../recognition-engine/recognitionEngine";

function hasIssuedStripeCertificate(
  athlete: EngineAthlete,
  tier: number,
  stripe: number
): boolean {
  return (athlete.certificates || []).some((cert: any) => {
    return (
      cert.type === "STRIPE" &&
      Number(cert.tier) === Number(tier) &&
      Number(cert.stripe) === Number(stripe)
    );
  });
}

function getLegacyXp(athlete: any): number {
  return Number(
    athlete?.xpBreakdown?.legacyXp ??
    athlete?.legacyXp ??
    athlete?.placementXp ??
    0
  );
}

function isLegacyStripeVetoed(
  athlete: any,
  tier: number,
  stripe: number
): boolean {
  if (getLegacyXp(athlete) <= 0) return false;
  if (Number(stripe) !== 1) return false;

  const veto = athlete?.legacyRecognitionVeto;

  if (veto?.enabled === true) {
    return (
      veto?.tiers?.[String(tier)]?.stripe1Vetoed === true ||
      veto?.tiers?.[Number(tier)]?.stripe1Vetoed === true
    );
  }

  // fallback rule for older legacy records:
  // legacy athletes do not receive Stripe I certificate in Tier 0 or Tier 1
  return Number(tier) === 0 || Number(tier) === 1;
}

function notReady(athlete: EngineAthlete, message: string) {
  return {
    printReady: false,
    certificateType: "NONE",
    athleteName: athlete.name,
    message
  };
}

function stripePayload(
  athlete: EngineAthlete,
  stripeDecision: any,
  certificateType: string,
  title: string,
  subtitle: string,
  stripe: number,
  message: string
) {
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

export function buildCertificatePayload(athlete: EngineAthlete) {
  const progression = evaluateProgression(athlete);
  const recognition = evaluateRecognition(athlete);
  const stripeDecision = progression.stripeDecision;
  const currentStripe = Number(athlete.stripe || 0);
  const currentTier = Number(athlete.tier || 0);

  if (currentStripe > 0) {
    if (isLegacyStripeVetoed(athlete, currentTier, currentStripe)) {
      return notReady(
        athlete,
        "Legacy placement recognized. Stripe I certificate is vetoed for this tier; recognition opens after deeper Sandman-earned progress."
      );
    }

    const alreadyIssued = hasIssuedStripeCertificate(
      athlete,
      currentTier,
      currentStripe
    );

    if (!recognition.stripeAward?.eligible) {
  return notReady(
    athlete,
    recognition.nextAction
  );
}

if (recognition.stripeAward?.completed) {
  return notReady(
    athlete,
    recognition.stripeAward.message
  );
}

    if (!alreadyIssued) {
      return stripePayload(
        athlete,
        stripeDecision,
        "STRIPE",
        `Stripe ${currentStripe}`,
        stripeDecision?.workingTowardBelt || "Next Belt",
        currentStripe,
        `${athlete.name} has earned Stripe ${currentStripe}.`
      );
    }
  }

  if (progression.certificateAction === "STRIPE_CERTIFICATE") {
    const nextStripe = Number(stripeDecision?.nextStripe || 0);

    if (isLegacyStripeVetoed(athlete, currentTier, nextStripe)) {
      return notReady(
        athlete,
        "Legacy placement recognized. Stripe I certificate is vetoed for this tier; recognition opens after deeper Sandman-earned progress."
      );
    }

    return stripePayload(
      athlete,
      stripeDecision,
      "STRIPE",
      `Stripe ${nextStripe}`,
      stripeDecision?.workingTowardBelt || "Next Belt",
      nextStripe,
      stripeDecision?.message || "Stripe certificate ready."
    );
  }

  if (progression.certificateAction === "TESTING_ELIGIBLE_STRIPE_CERTIFICATE") {
    const nextStripe = Number(stripeDecision?.nextStripe || 0);

    if (isLegacyStripeVetoed(athlete, currentTier, nextStripe)) {
      return notReady(
        athlete,
        "Legacy placement recognized. Testing certificate is blocked until deeper Sandman-earned progress is recorded."
      );
    }

    return stripePayload(
      athlete,
      stripeDecision,
      "TESTING_ELIGIBLE_STRIPE",
      `Stripe ${nextStripe}`,
      "Testing Eligible",
      nextStripe,
      stripeDecision?.message || "Testing eligible stripe certificate ready."
    );
  }

  return notReady(
    athlete,
    progression.nextAction || "No certificate ready."
  );
}