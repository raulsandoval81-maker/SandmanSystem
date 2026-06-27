import { placementXpForYears } from "./legacyPlacement";
import { LegacyDecision, LegacyRecognition } from "./legacyTypes";

function getStoredLegacy(athlete: any): LegacyRecognition | null {
  return athlete?.legacyRecognition || null;
}

export function evaluateLegacy(athlete: any): LegacyDecision {
  const stored = getStoredLegacy(athlete);

  if (stored?.enabled) {
    return {
      isLegacy: true,
      yearsExperience: Number(stored.yearsExperience || 0),
      placementXp: Number(stored.placementXp || 0),
      suppressStripe1Tier0: stored.suppressStripe1Tier0 === true,
      suppressStripe1Tier1: stored.suppressStripe1Tier1 === true,
      reason: `${stored.yearsExperience || 0} years prior experience honored.`
    };
  }

  const fallbackPlacementXp = Number(
    athlete?.xpBreakdown?.legacyXp ??
    athlete?.legacyXp ??
    athlete?.placementXp ??
    0
  );

  const fallbackYears =
    fallbackPlacementXp >= 600 ? 3 :
    fallbackPlacementXp >= 400 ? 2 :
    fallbackPlacementXp >= 200 ? 1 :
    0;

  if (fallbackPlacementXp > 0) {
    return {
      isLegacy: true,
      yearsExperience: fallbackYears,
      placementXp: fallbackPlacementXp,
      suppressStripe1Tier0: true,
      suppressStripe1Tier1: true,
      reason: `${fallbackPlacementXp} legacy XP detected from older record.`
    };
  }

  return {
    isLegacy: false,
    yearsExperience: 0,
    placementXp: placementXpForYears(0),
    suppressStripe1Tier0: false,
    suppressStripe1Tier1: false,
    reason: "No legacy placement."
  };
}