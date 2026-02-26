// XP Visual Config — badges, stripe sizing, moon overlays (no caps/points)
// Aligned to tier caps: F8 T0=800…T8=2400, F4 T0=800…T4=2400.

export const XP_VISUAL = Object.freeze({
  foundry8: {
    name: "Foundry 8 (Youth)",
    tiers: [
      { tier: "T0", name: "Shadow",     xpCap:  800, stripeXP: 200, badge: "shadow.png" },
      { tier: "T1", name: "Recruit",    xpCap: 1000, stripeXP: 250, badge: "recruit.png" },
      { tier: "T2", name: "Combatant",  xpCap: 1200, stripeXP: 300, badge: "combatant.png" },
      { tier: "T3", name: "Competitor", xpCap: 1400, stripeXP: 350, badge: "competitor.png" },
      { tier: "T4", name: "Warrior",    xpCap: 1600, stripeXP: 400, badge: "warrior.png" },
      { tier: "T5", name: "Champion",   xpCap: 1800, stripeXP: 450, badge: "champion.png" },
      { tier: "T6", name: "Veteran",    xpCap: 2000, stripeXP: 500, badge: "veteran.png" },
      { tier: "T7", name: "Hero",       xpCap: 2400, stripeXP: 600, badge: "hero.png" } // cap, no stripes
    ]
  },

  foundry4: {
    name: "Foundry 4 (Teen/Adult)",
    tiers: [
      { tier: "T0", name: "Apprentice", xpCap:  1200, stripeXP: 300, badge: "apprentice.png" },
      { tier: "T1", name: "Warrior",    xpCap: 1600, stripeXP: 400, badge: "warrior.png" },
      { tier: "T2", name: "Champion",   xpCap: 2000, stripeXP: 500, badge: "champion.png" },
      { tier: "T3", name: "Veteran",    xpCap: 2400, stripeXP: 600, badge: "veteran.png" }, // fixed from 2000 → 2200
      { tier: "T4", name: "Legend",     xpCap: 2800, stripeXP: 700, badge: "legend.png" }  // cap, no stripes
    ]
  },

  leadership: {
    name: "Leadership",
    tiers: [
      { tier: "T0", name: "Seed", xpCap:  800, badge: "leadership_apprentice.png" },
      { tier: "T1", name: "Mentor",     xpCap: 1200, badge: "leadership_mentor.png" },
      { tier: "T2", name: "Scholar",    xpCap: 1600, badge: "leadership_scholar.png" },
      { tier: "T3", name: "Advisor",    xpCap: 2000, badge: "leadership_advisor.png" },
      { tier: "T4", name: "Mastery",    xpCap: 2200, badge: "leadership_master.png" }
    ]
  }
});

// Hero (F8) & Legend (F4) have no overlay
export function getMoonOverlay(xpPercent, tierName) {
  const t = String(tierName || "").toLowerCase();
  if (t === "hero" || t === "legend") return null;
  if (xpPercent < 25)  return "crescent.png";       // 🌒
  if (xpPercent < 50)  return "first_quarter.png";  // 🌓
  if (xpPercent < 75)  return "gibbous.png";        // 🌔
  if (xpPercent < 100) return "full_moon.png";      // 🌕
  return "full_moon_glow.png";                      // ✨ at 100%
}

// Visual badge helper — uses stripeXP to compute % inside current tier
export function getBadge(track, xp) {
  const cfg = XP_VISUAL[track];
  if (!cfg) throw new Error(`Invalid track: ${track}`);
  const tiers = cfg.tiers;

  // find tier boundary by xpCap
  let current = tiers[0];
  for (let i = 0; i < tiers.length; i++) {
    if ((xp || 0) >= tiers[i].xpCap) current = tiers[i];
    else break;
  }


  return {
    ...current,
    xpPercent,
    moonOverlay: getMoonOverlay(xpPercent, current.name)
  };
}
