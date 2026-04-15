// XP Visual Config — badges, stripe sizing, moon overlays
// RESET-BASED system: xp is current-tier XP, not lifetime cumulative XP.

export const XP_VISUAL = Object.freeze({
  foundry8: {
    name: "Foundry 8 (Youth)",
    tiers: [
      { tier: "T0", name: "Shadow",     xpCap:  600, stripeCount: 3, stripeXP: 200, badge: "shadow.png" },
      { tier: "T1", name: "Recruit",    xpCap:  800, stripeCount: 4, stripeXP: 200, badge: "recruit.png" },
      { tier: "T2", name: "Combatant",  xpCap: 1000, stripeCount: 4, stripeXP: 250, badge: "combatant.png" },
      { tier: "T3", name: "Competitor", xpCap: 1200, stripeCount: 4, stripeXP: 300, badge: "competitor.png" },
      { tier: "T4", name: "Warrior",    xpCap: 1600, stripeCount: 4, stripeXP: 400, badge: "warrior.png" },
      { tier: "T5", name: "Champion",   xpCap: 1800, stripeCount: 4, stripeXP: 450, badge: "champion.png" },
      { tier: "T6", name: "Veteran",    xpCap: 2000, stripeCount: 4, stripeXP: 500, badge: "veteran.png" },
      { tier: "T7", name: "Hero",       xpCap: 2400, stripeCount: 4, stripeXP: 600, badge: "hero.png" } // cap tier visual units only
    ]
  },

  foundry4: {
    name: "Foundry 4 (Teen/Adult)",
    tiers: [
      { tier: "T0", name: "Apprentice", xpCap: 1200, stripeCount: 4, stripeXP: 300, badge: "apprentice.png" },
      { tier: "T1", name: "Warrior",    xpCap: 1600, stripeCount: 4, stripeXP: 400, badge: "warrior.png" },
      { tier: "T2", name: "Champion",   xpCap: 2000, stripeCount: 4, stripeXP: 500, badge: "champion.png" },
      { tier: "T3", name: "Veteran",    xpCap: 2400, stripeCount: 4, stripeXP: 600, badge: "veteran.png" },
      { tier: "T4", name: "Legend",     xpCap: 2800, stripeCount: 4, stripeXP: 700, badge: "legend.png" } // cap tier visual units only
    ]
  },

  leadership: {
    name: "Leadership",
    tiers: [
      { tier: "T0", name: "Seed",       xpCap:  800, badge: "leadership_apprentice.png" },
      { tier: "T1", name: "Mentor",     xpCap: 1200, badge: "leadership_mentor.png" },
      { tier: "T2", name: "Scholar",    xpCap: 1600, badge: "leadership_scholar.png" },
      { tier: "T3", name: "Advisor",    xpCap: 2000, badge: "leadership_advisor.png" },
      { tier: "T4", name: "Mastery",    xpCap: 2200, badge: "leadership_master.png" }
    ]
  }
});

// Hero (F8) & Legend (F4) have no moon overlay
export function getMoonOverlay(xpPercent, tierName) {
  const t = String(tierName || "").toLowerCase();
  if (t === "hero" || t === "legend") return null;
  if (xpPercent < 25)  return "crescent.png";
  if (xpPercent < 50)  return "first_quarter.png";
  if (xpPercent < 75)  return "gibbous.png";
  if (xpPercent < 100) return "full_moon.png";
  return "full_moon_glow.png";
}

export function getTrackTierConfig(track, tier) {
  const cfg = XP_VISUAL[track];
  if (!cfg) throw new Error(`Invalid track: ${track}`);

  const tierCfg = cfg.tiers.find((t) => t.tier === tier);
  if (!tierCfg) throw new Error(`Invalid tier "${tier}" for track "${track}"`);

  return tierCfg;
}

export function getStripeCount(xp, xpCap, stripeCount = 4) {
  const safeXp = Math.max(0, Number(xp) || 0);
  const safeCap = Math.max(1, Number(xpCap) || 1);
  const safeStripeCount = Math.max(1, Number(stripeCount) || 4);

  const thresholds = Array.from(
    { length: safeStripeCount },
    (_, i) => Math.round((safeCap / safeStripeCount) * (i + 1))
  );

  return thresholds.filter((t) => safeXp >= t).length;
}

// Main helper for RESET-based tiers.
// Requires current tier code or tier name from athlete doc.
export function getBadge(track, tier, xp) {
  const current = getTrackTierConfig(track, tier);

  const safeXp = Math.max(0, Number(xp) || 0);
  const safeCap = Math.max(1, Number(current.xpCap) || 1);
  const xpPercent = Math.min(100, Math.round((safeXp / safeCap) * 100));
  const stripesEarned = getStripeCount(safeXp, safeCap, current.stripeCount || 4);

  return {
    ...current,
    xp: safeXp,
    xpPercent,
    stripesEarned,
    moonOverlay: getMoonOverlay(xpPercent, current.name)
  };
}