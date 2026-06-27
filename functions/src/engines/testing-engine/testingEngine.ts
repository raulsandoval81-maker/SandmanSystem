import { EngineAthlete } from "../athlete-engine/athleteNormalizer";

import { PASSING_SCORE, requiredStripes } from "./testingRequirements";

import { TestingDecision } from "./testingTypes";

export function evaluateTesting(
  athlete: EngineAthlete
): TestingDecision {

  const needed = requiredStripes(athlete.programCode);

  const eligible =
    athlete.stripe >= needed;

  return {

    engine: "Sandman Testing Engine",

    eligible,

    athleteId: athlete.uid,

    athleteName: athlete.name,

    currentTier: athlete.tier,

    currentStripe: athlete.stripe,

    passingScore: PASSING_SCORE,

    status: eligible
      ? "READY_FOR_TEST"
      : "NOT_READY",

    nextAction: eligible
      ? "Testing"
      : "Continue earning stripes.",

    coachAction: eligible
      ? "Schedule athlete for testing."
      : "Continue training.",

    message: eligible
      ? `${athlete.name} is eligible to test.`
      : `${athlete.name} needs more stripes before testing.`

  };

}