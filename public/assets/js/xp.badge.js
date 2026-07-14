import {
  getCap,
  getRank,
  stripeStep,
  STRIPES_PER_TIER,
  normalizeBase,
  normalizeTier
} from "./xp.config.js";

function getMoonOverlay(xpPercent, tierName) {
  const tier = String(tierName || "").toLowerCase();

  if (
    tier === "hero" ||
    tier === "legend" ||
    tier === "mastery"
  ) {
    return null;
  }

  if (xpPercent < 25) return "crescent.png";
  if (xpPercent < 50) return "first_quarter.png";
  if (xpPercent < 75) return "gibbous.png";
  if (xpPercent < 100) return "full_moon.png";

  return "full_moon_glow.png";
}

export function getBadge(trackBase, tier, xp) {
  const base = normalizeBase(trackBase);
  const normalizedTier = normalizeTier(tier);

  const xpCap = getCap(base, normalizedTier);
  const rankName = getRank(base, normalizedTier);

  const safeXp = Math.max(0, Number(xp) || 0);
  const xpPercent = Math.min(
    100,
    Math.round((safeXp / xpCap) * 100)
  );

  const stripesTotal =
    base === "F8"
      ? (
          STRIPES_PER_TIER.F8[normalizedTier] ??
          STRIPES_PER_TIER.F8.default
        )
      : base === "ADULT"
        ? STRIPES_PER_TIER.ADULT.default
        : STRIPES_PER_TIER.F4.default;

  const step = stripeStep(base, normalizedTier);

  let stripesEarned = 0;

  for (let i = 1; i <= stripesTotal; i++) {
    if (safeXp >= step * i) {
      stripesEarned++;
    }
  }

  return {
    base,
    tier: normalizedTier,
    name: rankName,
    xp: safeXp,
    xpCap,
    xpPercent,
    stripesEarned,
    stripesTotal,
    moonOverlay: getMoonOverlay(
      xpPercent,
      rankName
    )
  };
}