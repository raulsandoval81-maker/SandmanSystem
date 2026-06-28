import type { RecognitionDecision, RecognitionType } from "./recognitionTypes";

/**
 * Central decision engine:
 * converts athlete state → recognition opportunities
 */
export function evaluateRecognition(a: any) {
  const tier = Number(a.tier ?? 0);
  const stripe = Number(a.stripeCount ?? a.stripe ?? 0);

  const testing = a.testing ?? {};

  return {
    stripeAward: buildDecision(
      "STRIPE_AWARD",
      tier,
      stripe,
      stripe > 0,
      stripe > 0 && stripe < 4,
      stripe === 0 ? "No stripes yet" : "Stripe available"
    ),

    certificate: buildDecision(
      "CERTIFICATE",
      tier,
      stripe,
      false,
      false,
      ""
    ),

    testing: buildDecision(
      "TESTING",
      tier,
      stripe,
      Boolean(testing.testEligibleAt),
      Boolean(testing.testEligibleAt && !testing.testScheduledAt),
      testing.testScheduledAt
        ? "Testing scheduled"
        : "Testing eligible"
    ),

    promotion: buildDecision(
      "PROMOTION",
      tier,
      stripe,
      testing.lastTestResult === "pass",
      testing.lastTestResult === "pass",
      testing.lastTestResult === "pass"
        ? "Promotion ready"
        : ""
    ),

    ceremony: buildDecision(
      "CEREMONY",
      tier,
      stripe,
      Boolean(a.promotionCompletedAt),
      Boolean(a.promotionCompletedAt && !a.ceremonyCompletedAt),
      a.ceremonyCompletedAt
        ? "Completed"
        : "Ceremony pending"
    ),

    nextAction: "PROCESS"
  };
}

/**
 * Hardened decision builder
 */
function buildDecision(
  type: RecognitionType,
  tier: number,
  stripe: number,
  eligible: boolean,
  pending: boolean,
  message: string
): RecognitionDecision {
  return {
    type,
    tier,
    stripe,
    eligible,
    pending,
    completed: !pending && !eligible,
    message
  };
}