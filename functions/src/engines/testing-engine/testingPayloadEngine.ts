import { EngineAthlete } from "../athlete-engine/athleteNormalizer";
import { evaluateTesting } from "./testingEngine";

export function buildTestingPayload(
  athlete: EngineAthlete
) {

  const decision =
    evaluateTesting(athlete);

  return {

    printReady: decision.eligible,

    decision

  };

}