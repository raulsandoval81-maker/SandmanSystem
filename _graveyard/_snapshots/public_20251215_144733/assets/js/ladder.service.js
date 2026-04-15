// assets/js/ladder.service.js
// Shared ladder math (Youth R0–R8, Teen/Foundry4 R0–R4) + shared colors
// Model: each tier has an absolute XP CAP. Start = previous CAP (or 0).

// ---------- Youth (R0–R8) ----------
export const LADDER_YOUTH = [
  { key: "R0", name: "Shadow",        cap:  800, stripe: 200, stripes: 4 },
  { key: "R1", name: "Recruit",       cap:  1000, stripe: 250, stripes: 4 },
  { key: "R2", name: "Combatant",     cap: 1200, stripe: 250, stripes: 4 },
  { key: "R3", name: "Competitor",    cap: 1400, stripe: 300, stripes: 4 },
  { key: "R4", name: "Warrior",       cap: 1600, stripe: 350, stripes: 4 },
  { key: "R5", name: "Champion",      cap: 1800, stripe: 400, stripes: 4 },
  { key: "R6", name: "Commander",     cap: 2000,  stripe:500, stripes: 4 },
  { key: "R7", name: "Sandman",       cap: 2200, stripe: 550, stripes: 4 },
  { key: "R8", name: "Hero",          cap: 2400, stripe: 600, stripes: 4 }, // final
];

// ---------- Foundry4 / Teen (R0–R4) ----------
export const LADDER_F4 = [
  { key: "R0", name: "Apprentice", cap: 1200, stripe: 300, stripes: 4 },
  { key: "R1", name: "Warrior",    cap: 1400, stripe: 350, stripes: 4 },
  { key: "R2", name: "Champion",   cap: 1600, stripe: 400, stripes: 4 },
  { key: "R3", name: "Veteran",    cap: 2200, stripe: 550, stripes: 4 },
  { key: "R4", name: "Legend",     cap: 2400, stripe: 600, stripes: 4 },    // final
];

// ---------- Shared color tokens ----------
export const COLORS = {
  legend:         { text:"#FFFFFF", start:"#000000", end:"#000000", outline:"#FFFFFF" },
  hero:           { text:"#FFFFFF", start:"#111111", end:"#111111", outline:"#FFFFFF" }, // white rim/glow
  veteran:        { text:"#FFFFFF", start:"#8B3A0E", end:"#B55A1E", outline:"#A44918" },
  champion:       { text:"#FFFFFF", start:"#5F1EE6", end:"#2A147A", outline:"#2A147A" }, // SAME for youth & teen
  warrior:        { text:"#FFFFFF", start:"#1B55D4", end:"#0D2D7A", outline:"#0D2D7A" }, // SAME for youth & teen
  apprentice:     { text:"#333333", start:"#FFFFFF", end:"#E9EEF3", outline:"#242A36" },
  sandman:        { text:"#111111", start:"#FFD400", end:"#FFCC00", outline:"#CCA400" },
  commander:      { text:"#FFFFFF", start:"#7C3A16", end:"#A34E1E", outline:"#6C2F12" },
  competitor:     { text:"#FFFFFF", start:"#22AA44", end:"#137D2B", outline:"#0C6A23" },
  combatant:      { text:"#FFFFFF", start:"#EA6A0F", end:"#FF7F1A", outline:"#CC5A0A" },
  recruit:        { text:"#111111", start:"#FFE47A", end:"#FFCF36", outline:"#D2A800" },
  shadow:         { text:"#111111", start:"#FFFFFF", end:"#FFFFFF", outline:"#CCCCCC" }
};

// Map display name -> color token key
export function colorKeyFor(name = "") {
  const n = String(name).toLowerCase();
  if (n === "legend")              return "legend";
  if (n === "hero")                return "hero";
  if (n === "veteran")             return "veteran";
  if (n === "champion")            return "champion";
  if (n === "warrior")             return "warrior";
  if (n === "apprentice")          return "apprentice";
  if (n === "sandman")             return "sandman";
  if (n === "commander")           return "commander";
  if (n === "competitor")          return "competitor";
  if (n === "combatant")           return "combatant";
  if (n === "recruit")             return "recruit";
  if (n === "shadow")              return "shadow";
  return "apprentice";
}

// -------------------------- Stripe / Progress -------------------------------
// Policy: ignore per-tier `stripe` size; use % thresholds:
// - Shadow (name contains 'shadow'): 3 stripes → 33/66/100
// - All non-final others: 4 stripes → 25/50/75/100
// - Final tier (name includes 'legend'): 0 stripes; continuous loop after 2400

function thresholdsFor(name = "", stripes = 0) {
  const key = String(name).toLowerCase();
  if (stripes === 0) return []; // final
  if (key.includes("shadow")) return [33, 66, 100];
  return [25, 50, 75, 100];
}

function findTierByCap(ladder, totalXP = 0) {
  // ladder caps are absolute XP thresholds
  let idx = 0;
  for (let i = 0; i < ladder.length; i++) {
    const cap = ladder[i].cap ?? 0;
    if (totalXP < cap) { idx = i; break; }
    if (totalXP >= cap && i < ladder.length - 1) { idx = i + 1; }
    else if (totalXP >= cap && i === ladder.length - 1) { idx = i; }
  }
  const tier = ladder[idx];
  const prevCap = idx === 0 ? 0 : (ladder[idx - 1].cap ?? 0);
  const nextTier = ladder[idx + 1] || null;
  const start = prevCap;
  const cap = tier.cap ?? prevCap + 1;
  const span = Math.max(1, cap - start);
  const xpIn = Math.max(0, totalXP - start);
  const pct = Math.round(Math.min(100, (xpIn / span) * 100));
  return { idx, tier, nextTier, start, cap, span, xpIn, pct };
}

/**
 * Primary API: given a ladder + totalXP, return progress + stripes.
 * Handles Legend/Junior Legend continuous climb from 2400.
 */
export function getStripeInfo(ladder, totalXP = 0) {
  if (!Array.isArray(ladder) || ladder.length === 0) return {};

  const { tier, nextTier, start, cap, span, xpIn, pct } = findTierByCap(ladder, totalXP);
  const nameKey = String(tier?.name || "").toLowerCase();

  // Final tier (Legend / Junior Legend): continuous loop from 2400
  if (nameKey.includes("legend")) {
    const legendStart = 2400;           // unified entry
    const legendSpan  = 1000;           // loop length (adjustable)
    const xpSinceLegend = Math.max(0, totalXP - legendStart);
    const cycle = Math.floor(xpSinceLegend / legendSpan);
    const inCycle = xpSinceLegend % legendSpan;
    const percent = Math.round((inCycle / legendSpan) * 100);
    const label = `${tier.name} ${roman(cycle + 1)} • ${percent}%`;

    return {
      tier,
      nextTier: null,
      totalXP,
      percent,
      stripesTotal: 0,
      stripesEarned: 0,
      xpToNextStripe: 0,
      xpToNextTier: 0,
      status: label,
    };
  }

  // Non-final tiers: stripes by percentage thresholds
  const stripesTotal = Number.isFinite(tier?.stripes) ? (tier.stripes || 0) : 0;
  const th = thresholdsFor(tier?.name, stripesTotal);
  const stripesEarned = th.filter(t => pct >= t).length;

  // XP-to-next stripe (derived from percent thresholds)
  let xpToNextStripe = 0;
  if (stripesEarned < th.length) {
    const nextPct = th[stripesEarned] / 100;
    const need = Math.ceil(nextPct * span) - xpIn;
    xpToNextStripe = Math.max(0, need);
  }

  const xpToNextTier = nextTier ? Math.max(0, (cap - totalXP)) : 0;

  return {
    tier,
    nextTier,
    totalXP,
    percent: pct,
    stripesTotal,
    stripesEarned,
    xpToNextStripe,
    xpToNextTier,
    status: stripesTotal ? `Stripes ${stripesEarned}/${stripesTotal}` : "",
  };
}

// Utility: one-line label
export function formatTierLine(ladder, totalXP = 0) {
  const info = getStripeInfo(ladder, totalXP);
  if (!info?.tier) return "";
  return info.nextTier
    ? `${info.tier.name} → ${info.nextTier.name}`
    : `${info.tier.name} (final)`;
}

// ------------------------------- Internals ----------------------------------
function roman(n) {
  const M=["","M","MM","MMM"], C=["","C","CC","CCC","CD","D","DC","DCC","DCCC","CM"];
  const X=["","X","XX","XXX","XL","L","LX","LXX","LXXX","XC"], I=["","I","II","III","IV","V","VI","VII","VIII","IX"];
  return M[Math.floor(n/1000)] + C[Math.floor((n%1000)/100)] + X[Math.floor((n%100)/10)] + I[n%10];
}
