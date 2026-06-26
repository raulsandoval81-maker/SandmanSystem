import { Athlete } from "../athlete-engine/sampleAthletes";
import { getPromotionStatus } from "./promotionStatus";
import { getStripeStatus } from "../stripe-engine/stripeStatus";

export interface PromotionDecision {
  approved: boolean;
  athleteId: string;
  athleteName: string;
  status: string;

  trainingShirt?: string;
  workingTowardBelt?: string;
  earnedBeltAfterPass?: string;

  xp: number;
  threshold: number;
  remaining: number;

  testRequired: boolean;
  passingScore: number;
  ceremonyRequired: boolean;

  message: string;

  certificateReady: boolean;
  testReady: boolean;
}

export function evaluatePromotion(athlete: Athlete): PromotionDecision {
  const status = getPromotionStatus(athlete);
  const stripeStatus = getStripeStatus(athlete);

  const fullyStriped = stripeStatus.status === "FULLY_STRIPED";

  if (status.status === "TESTING_ELIGIBLE" && fullyStriped) {
    return {
      approved: false,
      athleteId: athlete.id,
      athleteName: athlete.name,
      status: "TESTING_ELIGIBLE",

      trainingShirt: status.trainingShirt,
      workingTowardBelt: status.workingTowardBelt,
      earnedBeltAfterPass: status.earnedBeltAfterPass,

      xp: status.xp,
      threshold: status.threshold,
      remaining: status.remaining,

      testRequired: true,
      passingScore: 85,
      ceremonyRequired: true,

      message: `${athlete.name} is fully striped and testing eligible for ${status.workingTowardBelt}. Must pass with 85% or higher.`,

      certificateReady: false,
      testReady: true
    };
  }

  if (status.status === "TESTING_ELIGIBLE" && !fullyStriped) {
    return {
      approved: false,
      athleteId: athlete.id,
      athleteName: athlete.name,
      status: "NOT_READY",

      trainingShirt: status.trainingShirt,
      workingTowardBelt: status.workingTowardBelt,
      earnedBeltAfterPass: status.earnedBeltAfterPass,

      xp: status.xp,
      threshold: status.threshold,
      remaining: 0,

      testRequired: false,
      passingScore: 85,
      ceremonyRequired: false,

      message: `${athlete.name} has enough XP but must finish all stripes before testing.`,

      certificateReady: false,
      testReady: false
    };
  }

  if (status.status === "NOT_READY") {
    return {
      approved: false,
      athleteId: athlete.id,
      athleteName: athlete.name,
      status: "NOT_READY",

      trainingShirt: status.trainingShirt,
      workingTowardBelt: status.workingTowardBelt,
      earnedBeltAfterPass: status.earnedBeltAfterPass,

      xp: status.xp,
      threshold: status.threshold,
      remaining: status.remaining,

      testRequired: false,
      passingScore: 85,
      ceremonyRequired: false,

      message: `${athlete.name} needs ${status.remaining} more XP before stripe progression.`,

      certificateReady: false,
      testReady: false
    };
  }

  return {
    approved: false,
    athleteId: athlete.id,
    athleteName: athlete.name,
    status: "ERROR",

    xp: athlete.xp,
    threshold: 0,
    remaining: 0,

    testRequired: false,
    passingScore: 85,
    ceremonyRequired: false,

    message: "Promotion status could not be determined.",

    certificateReady: false,
    testReady: false
  };
}