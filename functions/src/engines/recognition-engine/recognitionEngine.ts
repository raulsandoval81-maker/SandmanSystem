import { evaluateProgression } from "../progression-engine/progressionEngine";
import { hasRecognition } from "./recognitionHistory";
import { RecognitionSummary } from "./recognitionTypes";

export function evaluateRecognition(athlete: any): RecognitionSummary {

  const progression = evaluateProgression(athlete);

  const tier = Number(athlete.tier || 0);
  const stripe = Number(
    athlete.stripe ||
    progression?.stripeDecision?.nextStripe ||
    0
  );

  const stripeAlreadyAwarded = hasRecognition(
    athlete,
    "STRIPE_AWARD",
    tier,
    stripe
  );

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

    nextAction:
      stripeAlreadyAwarded
        ? "No stripe award pending."
        : `Award Stripe ${stripe}.`

  };

}