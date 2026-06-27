import { evaluateProgression } from "../progression-engine/progressionEngine";
import { evaluateLegacy } from "../legacy-engine/legacyEngine";
import { hasRecognition } from "./recognitionHistory";
import { RecognitionSummary } from "./recognitionTypes";

function isLegacyStripeVetoed(
  athlete: any,
  tier: number,
  stripe: number
): boolean {
  const legacy = evaluateLegacy(athlete);

  if (!legacy.isLegacy) return false;
  if (Number(stripe) !== 1) return false;

  if (Number(tier) === 0 && legacy.suppressStripe1Tier0) return true;
  if (Number(tier) === 1 && legacy.suppressStripe1Tier1) return true;

  return false;
}

export function evaluateRecognition(athlete: any): RecognitionSummary {
  const progression = evaluateProgression(athlete);

  const tier = Number(athlete.tier || 0);
  const stripe = Number(
    athlete.stripe ||
    progression?.stripeDecision?.nextStripe ||
    0
  );

  const legacyVetoed = isLegacyStripeVetoed(athlete, tier, stripe);

  const stripeAlreadyAwarded = hasRecognition(
    athlete,
    "STRIPE_AWARD",
    tier,
    stripe
  );

  const stripePending =
    stripe > 0 &&
    !stripeAlreadyAwarded &&
    !legacyVetoed;

  return {
    stripeAward: {
      type: "STRIPE_AWARD",
      eligible: stripe > 0 && !legacyVetoed,
      pending: stripePending,
      completed: stripeAlreadyAwarded,
      tier,
      stripe,
      message:
        legacyVetoed
          ? `Legacy placement recognized. Stripe ${stripe} is not awardable in Tier ${tier}.`
          : stripeAlreadyAwarded
            ? `Stripe ${stripe} already awarded.`
            : `Stripe ${stripe} needs award.`
    },

    nextAction:
      legacyVetoed
        ? `Legacy placement recognized. Stripe ${stripe} is suppressed for Tier ${tier}.`
        : stripeAlreadyAwarded
          ? "No stripe award pending."
          : stripe > 0
            ? `Award Stripe ${stripe}.`
            : "No recognition action needed."
  };
}