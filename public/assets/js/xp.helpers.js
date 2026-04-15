import { XP_CONFIG } from "./xp.config.js";

function getMoonOverlay(xpPercent, tierName) {
  if (!tierName) return null;

  const t = String(tierName).toLowerCase();
  if (t === "hero" || t === "legend") return null;

  if (xpPercent < 25) return "crescent.png";
  if (xpPercent < 50) return "first_quarter.png";
  if (xpPercent < 75) return "gibbous.png";
  if (xpPercent < 100) return "full_moon.png";
  return "full_moon_glow.png";
}

function getStripeCount(xp, xpCap, stripeCount = 4) {
  const safeXp = Math.max(0, Number(xp) || 0);
  const safeCap = Math.max(1, Number(xpCap) || 1);
  const safeStripeCount = Math.max(1, Number(stripeCount) || 4);

  const step = safeCap / safeStripeCount;
  let earned = 0;

  for (let i = 1; i <= safeStripeCount; i++) {
    if (safeXp >= step * i) earned++;
  }

  return earned;
}

// RESET-BASED helper
// Pass current tier explicitly from athlete doc
// Returns { tier, name, xpCap, stripeXP, badge, xpPercent, moonOverlay, stripesEarned }
export function getBadge(track, tier, xp) {
  const config = XP_CONFIG[String(track).toLowerCase()];
  if (!config) throw new Error(`Invalid track: ${track}`);

  const current = config.tiers.find((t) => t.tier === tier);
  if (!current) throw new Error(`Invalid tier "${tier}" for track "${track}"`);

  const safeXp = Math.max(0, Number(xp) || 0);
  const safeCap = Math.max(1, Number(current.xpCap) || 1);

  const xpPercent = Math.min(100, Math.round((safeXp / safeCap) * 100));

  const stripeCount = Number(current.stripeCount || 4);
  const stripesEarned = getStripeCount(safeXp, safeCap, stripeCount);

  return {
    ...current,
    xpPercent,
    stripesEarned,
    moonOverlay: getMoonOverlay(xpPercent, current.name)
  };
}