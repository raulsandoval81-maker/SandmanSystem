import { DevelopmentPathway } from "./contracts";

/**
 * Pure policy preview only. The caller must obtain age from a verified
 * record; untrusted client-supplied age is not sufficient for activation.
 * This module never updates assignments, XP, stripes, or rank records.
 */
export type AgeTransitionPreview = Readonly<{
  decision: "not_due" | "transition_required" | "coach_exception_approved";
  destinationPathway: DevelopmentPathway;
  destinationRank: "apprentice" | "warrior" | null;
  requiresVerifiedAssignment: boolean;
  preservesHistoricalAchievements: true;
  performsMutation: false;
}>;

const youthRanks = ["shadow", "prospect", "competitor", "contender", "champion"] as const;

/**
 * At 14+, the youth Road2Champion pathway normally moves to Path2Legend.
 * Reaching Champion qualifies for entry at Warrior; everyone else begins
 * at Apprentice. A coach-approved exception may keep a Champion athlete
 * in the youth pathway, but cannot be self-attested by a client.
 */
export function previewAge14Transition(input: {
  verifiedAgeYears: number;
  currentPathway: DevelopmentPathway;
  currentRank: string;
  verifiedCoachException?: boolean;
}): AgeTransitionPreview {
  if (!Number.isInteger(input.verifiedAgeYears) ||
      input.verifiedAgeYears < 0 || input.verifiedAgeYears > 120)
    throw new Error("INVALID_VERIFIED_AGE");
  if (input.currentPathway === "path2legend") {
    if (!["apprentice", "warrior", "hero", "veteran", "legend"].includes(input.currentRank))
      throw new Error("INVALID_CURRENT_RANK");
    return {decision:"not_due",destinationPathway:"path2legend",destinationRank:null,
      requiresVerifiedAssignment:false,preservesHistoricalAchievements:true,performsMutation:false};
  }
  if (input.currentPathway !== "road2champion" ||
      !youthRanks.includes(input.currentRank as typeof youthRanks[number]))
    throw new Error("INVALID_CURRENT_RANK");
  if (input.verifiedAgeYears < 14)
    return {decision:"not_due",destinationPathway:"road2champion",destinationRank:null,
      requiresVerifiedAssignment:false,preservesHistoricalAchievements:true,performsMutation:false};
  if (input.currentRank === "champion" && input.verifiedCoachException === true)
    return {decision:"coach_exception_approved",destinationPathway:"road2champion",
      destinationRank:null,requiresVerifiedAssignment:false,
      preservesHistoricalAchievements:true,performsMutation:false};
  return {decision:"transition_required",destinationPathway:"path2legend",
    destinationRank:input.currentRank === "champion" ? "warrior" : "apprentice",
    requiresVerifiedAssignment:true,preservesHistoricalAchievements:true,performsMutation:false};
}
