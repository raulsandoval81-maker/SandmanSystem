import { Athlete } from "../athlete-engine/sampleAthletes";
import { PROGRAM_THRESHOLDS } from "../promotion-engine/programThresholds";

export interface StripeStatus {
  status: string;

  athleteId: string;
  athleteName: string;

  programCode: string;
  tier: number;

  currentStripe: number;
  nextStripe: number;
  stripesRequired: number;

  trainingShirt?: string;
  workingTowardBelt?: string;
  earnedBeltAfterPass?: string;

  xp: number;
  threshold: number;
  remaining: number;

  certificateReady: boolean;
  testingEligible: boolean;

  message: string;
}

export function getStripeStatus(athlete: Athlete): StripeStatus {
  const program = PROGRAM_THRESHOLDS[athlete.programCode];

  if (!program) {
    return {
      status: "ERROR",
      athleteId: athlete.id,
      athleteName: athlete.name,
      programCode: athlete.programCode,
      tier: athlete.tier,
      currentStripe: athlete.stripe || 0,
      nextStripe: 0,
      stripesRequired: 0,
      xp: athlete.xp,
      threshold: 0,
      remaining: 0,
      certificateReady: false,
      testingEligible: false,
      message: "Program not found."
    };
  }

  const tier = program.tiers.find(t => t.tier === athlete.tier);

  if (!tier) {
    return {
      status: "ERROR",
      athleteId: athlete.id,
      athleteName: athlete.name,
      programCode: athlete.programCode,
      tier: athlete.tier,
      currentStripe: athlete.stripe || 0,
      nextStripe: 0,
      stripesRequired: 0,
      xp: athlete.xp,
      threshold: 0,
      remaining: 0,
      certificateReady: false,
      testingEligible: false,
      message: "Tier not found."
    };
  }

  const currentStripe = athlete.stripe || 0;
  const nextStripe = currentStripe + 1;
  const stripesRequired = tier.stripesRequired;

  if (currentStripe >= stripesRequired) {
    return {
      status: "FULLY_STRIPED",
      athleteId: athlete.id,
      athleteName: athlete.name,
      programCode: athlete.programCode,
      tier: athlete.tier,
      currentStripe,
      nextStripe: currentStripe,
      stripesRequired,
      trainingShirt: tier.trainingShirt,
      workingTowardBelt: tier.workingTowardBelt,
      earnedBeltAfterPass: tier.earnedBeltAfterPass,
      xp: athlete.xp,
      threshold: tier.xp,
      remaining: 0,
      certificateReady: false,
      testingEligible: true,
      message: `${athlete.name} is fully striped and testing eligible.`
    };
  }

  const threshold = Math.ceil(
    (tier.xp * nextStripe) / stripesRequired
  );

  if (athlete.xp < threshold) {
    return {
      status: "NOT_READY",
      athleteId: athlete.id,
      athleteName: athlete.name,
      programCode: athlete.programCode,
      tier: athlete.tier,
      currentStripe,
      nextStripe,
      stripesRequired,
      trainingShirt: tier.trainingShirt,
      workingTowardBelt: tier.workingTowardBelt,
      earnedBeltAfterPass: tier.earnedBeltAfterPass,
      xp: athlete.xp,
      threshold,
      remaining: threshold - athlete.xp,
      certificateReady: false,
      testingEligible: false,
      message: `${athlete.name} needs ${threshold - athlete.xp} more XP before Stripe ${nextStripe}.`
    };
  }

  if (nextStripe === stripesRequired) {
    return {
      status: "TESTING_ELIGIBLE_STRIPE_READY",
      athleteId: athlete.id,
      athleteName: athlete.name,
      programCode: athlete.programCode,
      tier: athlete.tier,
      currentStripe,
      nextStripe,
      stripesRequired,
      trainingShirt: tier.trainingShirt,
      workingTowardBelt: tier.workingTowardBelt,
      earnedBeltAfterPass: tier.earnedBeltAfterPass,
      xp: athlete.xp,
      threshold,
      remaining: 0,
      certificateReady: true,
      testingEligible: true,
      message: `${athlete.name} has earned Stripe ${nextStripe} and is now testing eligible for ${tier.workingTowardBelt}.`
    };
  }

  return {
    status: "STRIPE_CERTIFICATE_READY",
    athleteId: athlete.id,
    athleteName: athlete.name,
    programCode: athlete.programCode,
    tier: athlete.tier,
    currentStripe,
    nextStripe,
    stripesRequired,
    trainingShirt: tier.trainingShirt,
    workingTowardBelt: tier.workingTowardBelt,
    earnedBeltAfterPass: tier.earnedBeltAfterPass,
    xp: athlete.xp,
    threshold,
    remaining: 0,
    certificateReady: true,
    testingEligible: false,
    message: `${athlete.name} has earned Stripe ${nextStripe}.`
  };
}
