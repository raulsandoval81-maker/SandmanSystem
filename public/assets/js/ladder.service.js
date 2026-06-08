// assets/js/ladder.service.js
// Shared ladder math (Foundry 8 Youth R0–R7, Foundry 4 Teen R0–R4) + shared colors
// Model: each tier has an absolute XP CAP. Tier start = previous CAP (or 0).

// ============================
// LADDERS
// ============================

// ---------- Foundry 8 / Youth (R0–R7) ----------
// Locked caps:
// Shadow 600, Recruit 800, Combatant 1000, Competitor 1200,
// Warrior 1400, Champion 1600, Commander 1800, Hero 2400.
export const LADDER_YOUTH = [
  { key:"R0", name:"Shadow",     cap:  600, stripe:200, stripes:3 },
  { key:"R1", name:"Recruit",    cap:  800, stripe:200, stripes:4 },
  { key:"R2", name:"Combatant",  cap: 1000, stripe:250, stripes:4 },
  { key:"R3", name:"Competitor", cap: 1200, stripe:300, stripes:4 },
  { key:"R4", name:"Warrior",    cap: 1400, stripe:350, stripes:4 },
  { key:"R5", name:"Champion",   cap: 1600, stripe:400, stripes:4 },
  { key:"R6", name:"Commander",  cap: 1800, stripe:450, stripes:4 },
  { key:"R7", name:"Hero",       cap: 2400, stripe:600, stripes:4 }
];
// Alias so pages can import either name
export const LADDER_F8 = LADDER_YOUTH;

// ---------- Foundry 4 / Teen (R0–R4) ----------
export const LADDER_F4 = [
  { key: "R0", name: "Apprentice", cap: 1000, stripe: 250, stripes: 4 },
  { key: "R1", name: "Warrior",    cap: 1600, stripe: 400, stripes: 4 },
  { key: "R2", name: "Champion",   cap: 2000, stripe: 500, stripes: 4 },
  { key: "R3", name: "Veteran",    cap: 2400, stripe: 600, stripes: 4 },
  { key: "R4", name: "Legend",     cap: 3000, stripe: 750, stripes: 4 },
];

// ---------- Quest2Mastery / Adult (R0–R4) ----------
export const LADDER_Q2M = [
  { key: "R0", name: "Apprentice", cap: 1000, stripe: 250, stripes: 4 },
  { key: "R1", name: "Warrior",    cap: 1600, stripe: 400, stripes: 4 },
  { key: "R2", name: "Champion",   cap: 2000, stripe: 500, stripes: 4 },
  { key: "R3", name: "Veteran",    cap: 2400, stripe: 600, stripes: 4 },
  { key: "R4", name: "Master",     cap: 3000, stripe: 750, stripes: 4 },
];
// Optional alias (if you ever prefer “teen” naming)
export const LADDER_TEEN = LADDER_F4;

// ============================
// COLORS
// ============================

export const COLORS = {
  legend:     { text:"#FFFFFF", start:"#000000", end:"#000000", outline:"#FFFFFF" },
  hero:       { text:"#FFFFFF", start:"#111111", end:"#111111", outline:"#FFFFFF" }, // white rim/glow
  veteran:    { text:"#FFFFFF", start:"#8B3A0E", end:"#B55A1E", outline:"#A44918" },
  champion:   { text:"#FFFFFF", start:"#5F1EE6", end:"#2A147A", outline:"#2A147A" },
  warrior:    { text:"#FFFFFF", start:"#1B55D4", end:"#0D2D7A", outline:"#0D2D7A" },
  apprentice: { text:"#333333", start:"#FFFFFF", end:"#E9EEF3", outline:"#242A36" },
  commander:  { text:"#FFFFFF", start:"#7C3A16", end:"#A34E1E", outline:"#6C2F12" },
  competitor: { text:"#FFFFFF", start:"#22AA44", end:"#137D2B", outline:"#0C6A23" },
  combatant:  { text:"#FFFFFF", start:"#EA6A0F", end:"#FF7F1A", outline:"#CC5A0A" },
  recruit:    { text:"#111111", start:"#FFE47A", end:"#FFCF36", outline:"#D2A800" },
  shadow:     { text:"#111111", start:"#FFFFFF", end:"#FFFFFF", outline:"#CCCCCC" },

};

// Map display name -> color token key
export function colorKeyFor(name = "") {
  const n = String(name).toLowerCase();
  if (n === "legend")     return "legend";
  if (n === "master") return "legend";
  if (n === "hero")       return "hero";
  if (n === "veteran")    return "veteran";
  if (n === "champion")   return "champion";
  if (n === "warrior")    return "warrior";
  if (n === "apprentice") return "apprentice";
  if (n === "commander")  return "commander";
  if (n === "competitor") return "competitor";
  if (n === "combatant")  return "combatant";
  if (n === "recruit")    return "recruit";
  if (n === "shadow")     return "shadow";
  return "apprentice";
}
export function getLadderForAthlete(a = {}) {
  const id = String(a.uid || a.uidCode || a.id || "").toUpperCase();

  const track = String(
    a.programTrack ||
    a.track ||
    a.trackCode ||
    ""
  ).toLowerCase();

  const rank = String(a.rankName || "").toLowerCase();

  // Quest2Mastery / Adult
  if (
    track.includes("quest2mastery") ||
    track.includes("adult")
  ) {
    return LADDER_Q2M;
  }

  // Foundry 8 / Youth
  if (
    id.startsWith("F8_") ||
    track.includes("foundry8") ||
    rank === "shadow" ||
    rank === "recruit" ||
    rank === "combatant" ||
    rank === "competitor" ||
    rank === "commander" ||
    rank === "hero"
  ) {
    return LADDER_F8;
  }

  // Default Foundry 4 Teen
  return LADDER_F4;
}

export function getAthleteStripeInfo(a = {}) {
  const xp = Math.max(0, Number(a.xp || 0));
const ladder = getLadderForAthlete(a);
const fallbackCap = Number(ladder?.[0]?.cap || 1000);
const xpCap = Math.max(1, Number(a.xpCap || fallbackCap));

  const stripesTotal = 4;
  const stripeSize = xpCap / stripesTotal;

  const stripesEarned = Math.max(
    0,
    Math.min(stripesTotal, Math.floor(xp / stripeSize))
  );

  return {
    tier: { name: a.rankName || a.tierName || a.tier || "Apprentice" },
    nextTier: null,
    totalXP: xp,
    capXP: xpCap,
    xpInTier: xp,
    percent: Math.round(Math.min(100, (xp / xpCap) * 100)),
    stripesTotal,
    stripesEarned,
    xpToNextStripe:
      stripesEarned < stripesTotal
        ? Math.max(0, Math.ceil((stripesEarned + 1) * stripeSize) - xp)
        : 0,
    xpToNextTier: Math.max(0, xpCap - xp),
    status: `Stripes ${stripesEarned}/${stripesTotal}`,
  };
}
// ============================
// STRIPES / PROGRESS
// ============================

// Policy: stripes earned by % thresholds (not by tier.stripe size).
// Default: 4 stripes => 25/50/75/100.
function thresholdsFor(stripes = 4) {
  if (!Number.isFinite(stripes) || stripes <= 0) return [];
  if (stripes === 1) return [100];
  if (stripes === 2) return [50, 100];
  if (stripes === 3) return [33, 66, 100]; // only if you ever set stripes=3
  return [25, 50, 75, 100];
}

function findTierByCap(ladder, totalXP = 0) {
  let idx = 0;

for (let i = 0; i < ladder.length; i++) {
  const cap = ladder[i]?.cap ?? 0;

  if (totalXP <= cap) {
    idx = i;
    break;
  }

  if (i === ladder.length - 1) {
    idx = i;
  }
}
  const tier = ladder[idx];
  const prevCap = idx === 0 ? 0 : (ladder[idx - 1]?.cap ?? 0);
  const nextTier = ladder[idx + 1] || null;

  const start = prevCap;
  const cap = tier?.cap ?? (prevCap + 1);
  const span = Math.max(1, cap - start);

  const xpInTier = Math.max(0, totalXP - start);
  const pct = Math.round(Math.min(100, (xpInTier / span) * 100));

  return { idx, tier, nextTier, start, cap, span, xpInTier, pct };
}

// If you ever want “final tier loop” behavior, flip this on.
// Leaving it OFF prevents confusing UI for athletes.
const FINAL_TIER_LOOP_ENABLED = false;
const FINAL_TIER_LOOP_SPAN = 1000;

/**
 * Primary API: given a ladder + totalXP, return progress + stripes.
 * Return shape matches belt-bar.js expectations:
 * { tier, nextTier, capXP, xpInTier, percent, stripesTotal, stripesEarned, ... }
 */
export function getStripeInfo(ladder, totalXP = 0) {
  if (!Array.isArray(ladder) || ladder.length === 0) return {};

  const { tier, nextTier, start, cap, span, xpInTier, pct } = findTierByCap(ladder, totalXP);
  const nameKey = String(tier?.name || "").toLowerCase();

  // Optional: final tier loop (Legend only, and only if enabled)
  if (FINAL_TIER_LOOP_ENABLED && nameKey.includes("legend")) {
    const finalStart = start;
    const xpSince = Math.max(0, totalXP - finalStart);

    const cycle = Math.floor(xpSince / FINAL_TIER_LOOP_SPAN);
    const inCycle = xpSince % FINAL_TIER_LOOP_SPAN;
    const percent = Math.round((inCycle / FINAL_TIER_LOOP_SPAN) * 100);
    const label = `${tier.name} ${roman(cycle + 1)} • ${percent}%`;

    return {
      tier,
      nextTier: null,
      totalXP,
      capXP: span,
      xpInTier,
      percent,
      stripesTotal: 0,
      stripesEarned: 0,
      xpToNextStripe: 0,
      xpToNextTier: 0,
      status: label,
    };
  }

  // Normal tiers
  const configuredStripes = Number.isFinite(tier?.stripes) ? (tier.stripes || 0) : 0;
  const th = thresholdsFor(configuredStripes || 4);

  const stripesTotal = th.length;
  const stripesEarned = th.filter(t => pct >= t).length;

  let xpToNextStripe = 0;
  if (stripesEarned < th.length) {
    const nextPct = th[stripesEarned] / 100;
    const need = Math.ceil(nextPct * span) - xpInTier;
    xpToNextStripe = Math.max(0, need);
  }

  const xpToNextTier = nextTier ? Math.max(0, (cap - totalXP)) : 0;

  return {
    tier,
    nextTier,
    totalXP,
    capXP: span,
    xpInTier,
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

// ============================
// INTERNALS
// ============================

function roman(n) {
  const M=["","M","MM","MMM"], C=["","C","CC","CCC","CD","D","DC","DCC","DCCC","CM"];
  const X=["","X","XX","XXX","XL","L","LX","LXX","LXXX","XC"], I=["","I","II","III","IV","V","VI","VII","VIII","IX"];
  return M[Math.floor(n/1000)] + C[Math.floor((n%1000)/100)] + X[Math.floor((n%100)/10)] + I[n%10];
}
