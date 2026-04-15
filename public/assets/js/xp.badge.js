import {
  getCap,
  getRank,
  stripeStep,
  STRIPES_PER_TIER,
  normalizeBase,
  normalizeTier
} from "./xp.config.js";

function getMoonOverlay(xpPercent, tierName) {
  const t = String(tierName || "").toLowerCase();
  if (t === "hero" || t === "legend") return null;

  if (xpPercent < 25) return "crescent.png";
  if (xpPercent < 50) return "first_quarter.png";
  if (xpPercent < 75) return "gibbous.png";
  if (xpPercent < 100) return "full_moon.png";
  return "full_moon_glow.png";
}

export function getBadge(trackBase, tier, xp) {
  const base = normalizeBase(trackBase);
  const t = normalizeTier(tier);

  const cap = getCap(base, t);
  const rank = getRank(base, t);

  const safeXp = Math.max(0, Number(xp) || 0);
  const xpPercent = Math.min(100, Math.round((safeXp / cap) * 100));

  const stripesTotal =
    base === "F8"
      ? (STRIPES_PER_TIER.F8[t] ?? STRIPES_PER_TIER.F8.default)
      : STRIPES_PER_TIER.F4.default;

  const step = stripeStep(base, t);

  let stripesEarned = 0;
  for (let i = 1; i <= stripesTotal; i++) {
    if (safeXp >= step * i) stripesEarned++;
  }

  return {
    base,
    tier: t,
    name: rank,
    xp: safeXp,
    xpCap: cap,
    xpPercent,
    stripesEarned,
    stripesTotal,
    moonOverlay: getMoonOverlay(xpPercent, rank)
  };
}