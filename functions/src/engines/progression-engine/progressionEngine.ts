import { Athlete } from "../athlete-engine/sampleAthletes";
import { evaluateStripe } from "../stripe-engine/stripeEngine";
import { evaluatePromotion } from "../promotion-engine/promotionEngine";

export interface ProgressionDecision {
  engine: string;
  athleteId: string;
  athleteName: string;
  state: string;
  nextAction: string;
  coachAction: string;
  certificateAction: string;
  testingAction: string;
  ceremonyAction: string;
  stripeDecision: ReturnType<typeof evaluateStripe>;
  promotionDecision: ReturnType<typeof evaluatePromotion>;
}

export function evaluateProgression(athlete: Athlete): ProgressionDecision {
  const stripeDecision = evaluateStripe(athlete);
  const promotionDecision = evaluatePromotion(athlete);

  if (stripeDecision.status === "STRIPE_CERTIFICATE_READY") {
    return {
      engine: "Sandman Progression Engine",
      athleteId: athlete.id,
      athleteName: athlete.name,
      state: "STRIPE_CERTIFICATE_READY",
      nextAction: `Generate Stripe ${stripeDecision.nextStripe} Certificate`,
      coachAction: "Print stripe certificate.",
      certificateAction: "STRIPE_CERTIFICATE",
      testingAction: "NO_TEST_YET",
      ceremonyAction: "NO_CEREMONY_ACTION",
      stripeDecision,
      promotionDecision
    };
  }

  if (stripeDecision.status === "TESTING_ELIGIBLE_STRIPE_READY") {
    return {
      engine: "Sandman Progression Engine",
      athleteId: athlete.id,
      athleteName: athlete.name,
      state: "TESTING_ELIGIBLE_STRIPE_READY",
      nextAction: `Generate Stripe ${stripeDecision.nextStripe} Testing Eligibility Certificate`,
      coachAction: "Print testing eligibility stripe certificate, then schedule test.",
      certificateAction: "TESTING_ELIGIBLE_STRIPE_CERTIFICATE",
      testingAction: "SCHEDULE_TEST",
      ceremonyAction: "NO_CEREMONY_ACTION",
      stripeDecision,
      promotionDecision
    };
  }

  if (stripeDecision.status === "FULLY_STRIPED") {
    return {
      engine: "Sandman Progression Engine",
      athleteId: athlete.id,
      athleteName: athlete.name,
      state: "READY_FOR_TESTING",
      nextAction: "Schedule test.",
      coachAction: "Schedule or record test score.",
      certificateAction: "NO_CERTIFICATE",
      testingAction: "READY_FOR_TESTING",
      ceremonyAction: "NO_CEREMONY_ACTION",
      stripeDecision,
      promotionDecision
    };
  }

  if (stripeDecision.status === "NOT_READY") {
    return {
      engine: "Sandman Progression Engine",
      athleteId: athlete.id,
      athleteName: athlete.name,
      state: "NOT_READY",
      nextAction: "Continue training.",
      coachAction: "Keep logging attendance and XP.",
      certificateAction: "NO_CERTIFICATE",
      testingAction: "NO_TEST_YET",
      ceremonyAction: "NO_CEREMONY_ACTION",
      stripeDecision,
      promotionDecision
    };
  }

  return {
    engine: "Sandman Progression Engine",
    athleteId: athlete.id,
    athleteName: athlete.name,
    state: "ERROR",
    nextAction: "Review athlete record.",
    coachAction: "Check program, tier, stripe, and XP data.",
    certificateAction: "NO_CERTIFICATE",
    testingAction: "NO_TEST_YET",
    ceremonyAction: "NO_CEREMONY_ACTION",
    stripeDecision,
    promotionDecision
  };
}