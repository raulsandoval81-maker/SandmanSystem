import { XP_CONFIG } from "./xp.config.js";

function getMoonOverlay(xpPercent, tierName) {
  // Hero (F8) + Legend (F4) are static — no overlay
  if (!tierName) return null;
  const t = tierName.toLowerCase();
  if (t === "hero" || t === "legend") return null;

  if (xpPercent < 25) return "crescent.png";        // 🌒
  if (xpPercent < 50) return "first_quarter.png";   // 🌓
  if (xpPercent < 75) return "gibbous.png";         // 🌔
  if (xpPercent < 100) return "full_moon.png";      // 🌕
  return "full_moon_glow.png";                      // ✨
}

// Returns { tier, name, xpCap, stripeXP, badge, xpPercent, moonOverlay }
export function getBadge(track, xp) {
  const config = XP_CONFIG[track.toLowerCase()];
  if (!config) throw new Error(`Invalid track: ${track}`);

  const tiers = config.tiers;
  let current = tiers[0];

  for (let i = tiers.length - 1; i >= 0; i--) {
    if (xp >= tiers[i].xpCap) { current = tiers[i]; break; }
  }

  let xpPercent = 0;
  if (current.stripeXP) {
    const base = current.xpCap - current.stripeXP;
    xpPercent = ((xp - base) / current.stripeXP) * 100;
    if (xpPercent < 0) xpPercent = 0;
    if (xpPercent > 100) xpPercent = 100;
  }

  return {
    ...current,
    xpPercent,
    moonOverlay: getMoonOverlay(xpPercent, current.name)
  };
}
