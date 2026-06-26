import { Athlete } from "../athlete-engine/sampleAthletes";
import { evaluateProgression } from "../progression-engine/progressionEngine";

export function buildCertificatePayload(athlete: Athlete) {
  const progression = evaluateProgression(athlete);

  const stripe = progression.stripeDecision;

  if (progression.certificateAction === "STRIPE_CERTIFICATE") {
    return {
      printReady: true,
      certificateType: "STRIPE",
      title: `Stripe ${stripe.nextStripe}`,
      subtitle: stripe.workingTowardBelt,
      athleteName: athlete.name,
      programName: athlete.programName,
      programCode: athlete.programCode,
      tier: athlete.tier,
      stripe: stripe.nextStripe,
      trainingShirt: stripe.trainingShirt,
      workingTowardBelt: stripe.workingTowardBelt,
      coach: athlete.coach,
      dateAwarded: new Date().toISOString(),
      message: stripe.message
    };
  }

  if (progression.certificateAction === "TESTING_ELIGIBLE_STRIPE_CERTIFICATE") {
    return {
      printReady: true,
      certificateType: "TESTING_ELIGIBLE_STRIPE",
      title: `Stripe ${stripe.nextStripe}`,
      subtitle: "Testing Eligible",
      athleteName: athlete.name,
      programName: athlete.programName,
      programCode: athlete.programCode,
      tier: athlete.tier,
      stripe: stripe.nextStripe,
      trainingShirt: stripe.trainingShirt,
      workingTowardBelt: stripe.workingTowardBelt,
      coach: athlete.coach,
      dateAwarded: new Date().toISOString(),
      message: stripe.message
    };
  }

  return {
    printReady: false,
    certificateType: "NONE",
    athleteName: athlete.name,
    message: progression.nextAction
  };
}