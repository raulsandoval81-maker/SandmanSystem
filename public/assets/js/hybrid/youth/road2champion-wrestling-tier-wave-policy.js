import { R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK } from "./road2champion-wrestling-tier-wave-crosswalk.js";

const INSTRUCTIONAL_TIERS = Object.freeze(["T0", "T1", "T2", "T3", "T4"]);

export function resolveRoad2ChampionWrestlingTierWaves(tier) {
  const normalized = String(tier || "").trim().toUpperCase();
  if (!INSTRUCTIONAL_TIERS.includes(normalized)) return null;
  const placement = R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.tiers?.[normalized];
  if (!placement) return null;
  return Object.freeze({
    version: R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.version,
    placementVersion: R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.placementVersion,
    tier: normalized,
    rankName: placement.rankName,
    foundations: placement.foundations,
    waves: placement.waves,
  });
}
