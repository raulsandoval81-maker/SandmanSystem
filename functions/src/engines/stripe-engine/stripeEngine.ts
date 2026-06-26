import { Athlete } from "../athlete-engine/sampleAthletes";
import { getStripeStatus, StripeStatus } from "./stripeStatus";

export interface StripeDecision extends StripeStatus {
  engine: string;
  action: string;
}

export function evaluateStripe(athlete: Athlete): StripeDecision {
  const status = getStripeStatus(athlete);

  let action = "NO_ACTION";

  if (status.status === "STRIPE_CERTIFICATE_READY") {
    action = "GENERATE_STRIPE_CERTIFICATE";
  }

  if (status.status === "TESTING_ELIGIBLE_STRIPE_READY") {
    action = "GENERATE_TESTING_ELIGIBLE_STRIPE_CERTIFICATE";
  }

  if (status.status === "FULLY_STRIPED") {
    action = "READY_FOR_TESTING";
  }

  return {
    engine: "Sandman Stripe Engine",
    action,
    ...status
  };
}