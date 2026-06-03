// /assets/js/xp.config.js
// Single Source of Truth — V1
// RESET-BASED system: xp is current-tier XP, not lifetime cumulative XP.

export const STRIPES_PER_TIER = {
F8: {
T0: 3, // Shadow
default: 4
},
F4: {
default: 4
},
ADULT: {
default: 4
}
};

export const XP_CONFIG = Object.freeze({

// =========================
// Foundry 4 (Teen) — Legend Ladder
// NOTE: unchanged until teen legacy migration is decided.
// =========================
foundry4: {
tierCaps: {
T0: 1200,
T1: 1600,
T2: 2000,
T3: 2400,
T4: 2800
},


monthly: {
  attendance: 200,
  attendanceNegFishEventsMax: 2,
  arena: { T0: null, T1: null, T2: null, T3: null, T4: null }
},

character: {
  parentRewardMax: 10,
  parentDeductMax: 10,
  netMax: 10,
  domains: ["HOME", "CLASSROOM", "COMMUNITY"]
},

lanes: {
  strength: { deltaFull: 10, deltaMerit: 5, monthlyCap: 120 },
  honor:    { deltaFull: 10, deltaMerit: 5, monthlyCap: 120 }
},

arena: { battle: 10, podium: 5, styleIQ: 5, styleIQMaxPerEvent: 1 },
prestigeYearly: { state: 3, regional: 1, national: 1 },

ranks: {
  T0: "Apprentice",
  T1: "Warrior",
  T2: "Champion",
  T3: "Veteran",
  T4: "Legend"
}


},

// =========================
// Foundry 8 (Youth) — Hero Ladder
// Updated after real-room testing.
// =========================
foundry8: {
tierCaps: {
T0: 600,
T1: 800,
T2: 1000,
T3: 1200,
T4: 1400,
T5: 1600,
T6: 1800,
T7: 2400
},


monthly: {
  attendance: 160,
  attendanceNegFishEventsMax: 2,

  arena: {
    T0: 0,
    T1: 40,
    T2: 40,
    T3: 60,
    T4: 60,
    T5: 60,
    T6: 60,
    T7: 80
  }
},

character: {
  parentRewardMax: 10,
  parentDeductMax: 10,
  netMax: 10,
  domains: ["HOME", "CLASSROOM", "COMMUNITY"]
},

contributions: {
  strength: { delta: 5, monthlyCap: 40 },
  honor:    { delta: 5, monthlyCap: 40 }
},

// Youth unlock gates
unlockGates: {
  strength: { tier: "T0", stripe: 1 },
  honor:    { tier: "T0", stripe: 2 }
},

arena: { battle: 10, podium: 5, styleIQ: 5, styleIQMaxPerEvent: 1 },
prestigeYearly: { state: 3, regional: 1, national: 1 },

ranks: {
  T0: "Shadow",
  T1: "Recruit",
  T2: "Combatant",
  T3: "Competitor",
  T4: "Warrior",
  T5: "Champion",
  T6: "Commander",
  T7: "Hero"
}


},

// =========================
// Adult Quest2Mastery — Mastery Ladder
// =========================
adult: {
tierCaps: {
T0: 1000,
T1: 1600,
T2: 2000,
T3: 2400,
T4: 3000
},


monthly: {
  attendance: 200,
  attendanceNegFishEventsMax: 2,
  arena: { T0: null, T1: null, T2: null, T3: null, T4: null }
},

character: {
  parentRewardMax: 10,
  parentDeductMax: 10,
  netMax: 10,
  domains: ["HOME", "TRAINING", "COMMUNITY"]
},

lanes: {
  strength: { deltaFull: 10, deltaMerit: 5, monthlyCap: 120 },
  honor:    { deltaFull: 10, deltaMerit: 5, monthlyCap: 120 }
},

arena: { battle: 10, podium: 5, styleIQ: 5, styleIQMaxPerEvent: 1 },
prestigeYearly: { state: 3, regional: 1, national: 1 },

ranks: {
  T0: "Apprentice",
  T1: "Warrior",
  T2: "Champion",
  T3: "Veteran",
  T4: "Mastery"
}


}
});

// ---- Compat mirror for older code that expects F4/F8 keys ----
export const COMPAT = Object.freeze({
F4: { caps: XP_CONFIG.foundry4.tierCaps, ranks: XP_CONFIG.foundry4.ranks },
F8: { caps: XP_CONFIG.foundry8.tierCaps, ranks: XP_CONFIG.foundry8.ranks },
ADULT: { caps: XP_CONFIG.adult.tierCaps, ranks: XP_CONFIG.adult.ranks }
});

// ======================================================
// HELPERS
// ======================================================
export function baseFromTrackCode(code = "") {
const c = String(code).toUpperCase();

if (c.startsWith("F8") || c.includes("FOUNDRY8") || c.includes("YOUTH")) {
return "F8";
}

if (
c.includes("ADULT") ||
c.includes("Q2M") ||
c.includes("QUEST2MASTERY") ||
c.includes("MASTERY")
) {
return "ADULT";
}

return "F4";
}

export function normalizeBase(base = "F4") {
const s = String(base).toLowerCase();

if (s.startsWith("f8") || s.includes("foundry8") || s.includes("youth")) {
return "F8";
}

if (
s.includes("adult") ||
s.includes("q2m") ||
s.includes("quest2mastery") ||
s.includes("mastery")
) {
return "ADULT";
}

return "F4";
}

export function normalizeTier(tier = "T0") {
const t = String(tier).toUpperCase().trim();
if (/^T\d+$/.test(t)) return t;

const n = Number(tier);
return Number.isFinite(n) ? `T${n}` : "T0";
}

function getTrackConfig(base) {
if (base === "F8") return XP_CONFIG.foundry8;
if (base === "ADULT") return XP_CONFIG.adult;
return XP_CONFIG.foundry4;
}

export function getCap(trackBaseOrKey, tier = "T0") {
const base = normalizeBase(trackBaseOrKey);
const t = normalizeTier(tier);

return getTrackConfig(base).tierCaps[t] ?? 800;
}

export function getRank(trackBaseOrKey, tier = "T0") {
const base = normalizeBase(trackBaseOrKey);
const t = normalizeTier(tier);

return (
getTrackConfig(base).ranks[t]
?? (base === "F8" ? "Shadow" : "Apprentice")
);
}

export function stripeStep(trackBaseOrKey, tier = "T0") {
const base = normalizeBase(trackBaseOrKey);
const t = normalizeTier(tier);

const cap = getCap(base, t);

const stripes =
base === "F8"
? (STRIPES_PER_TIER.F8[t] ?? STRIPES_PER_TIER.F8.default)
: base === "ADULT"
? STRIPES_PER_TIER.ADULT.default
: STRIPES_PER_TIER.F4.default;

return Math.max(1, Math.round(cap / stripes / 10) * 10);
}

// ======================================================
// XP BUCKETS (UI labels only)
// ======================================================
export const XP_BUCKETS = Object.freeze({
daily:   { key: "xpDaily",   label: "Daily Grind XP" },
arena:   { key: "xpArena",   label: "Combat Arena XP" },
fightIQ: { key: "xpFightIQ", label: "Fight IQ XP" },
total:   { key: "xp",        label: "Total XP" }
});

// ======================================================
// TRACK ALIASES
// ======================================================
export const TRACKS = Object.freeze({
F4: "foundry4",
F8: "foundry8",
ADULT: "adult"
});

export const XP_CONFIG_COMPAT = Object.freeze({
F4: COMPAT.F4,
F8: COMPAT.F8,
ADULT: COMPAT.ADULT
});
