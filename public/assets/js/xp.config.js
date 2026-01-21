// /assets/js/xp.config.js  — single source of truth (CLEAN TOP → BOTTOM)

export const XP_CONFIG = Object.freeze({
  // =========================
  // Foundry 4 (Olders / HS)
  // =========================
  // Caps: 1200 → 1600 → 2000 → 2400 → 2800
  // Arena monthly cap: REMOVED (null = unlimited)
  foundry4: {
    tierCaps: { T0: 1200, T1: 1600, T2: 2000, T3: 2400, T4: 2800 },
    monthly: {
      attendance: 200,
      attendanceNegFishEventsMax: 4,
      arena: { T0: null, T1: null, T2: null, T3: null, T4: null }, // ✅ unlimited for HS
      character: { parentRewardMax: 10, parentDeductMax: 10, netMax: 10 }
    },
    arena: { battle: 10, podium: 5, styleIQ: 5, styleIQMaxPerEvent: 1 },
    prestigeYearly: { state: 3, regional: 1, national: 1 },
    ranks: { T0:"Apprentice", T1:"Warrior", T2:"Champion", T3:"Veteran", T4:"Legend" }
  },

  // =========================
  // Foundry 8 (Youth)
  // =========================
  // 8 tiers (T0–T7). Start at 800. No Sandman.
  // Caps: 800 → 1000 → 1200 → 1400 → 1600 → 1800 → 2000 → 2400
  // Arena monthly cap: KEPT (youth throttles)
  foundry8: {
    tierCaps: { T0: 800, T1: 1000, T2: 1200, T3: 1400, T4: 1600, T5: 1800, T6: 2000, T7: 2400 },
    monthly: {
      attendance: 160,
      attendanceNegFishEventsMax: 4,
      arena: { T0: 0, T1: 40, T2: 40, T3: 60, T4: 60, T5: 60, T6: 60, T7: 80 },
      character: { parentRewardMax: 10, parentDeductMax: 10, netMax: 10 }
    },
    arena: { battle: 10, podium: 5, styleIQ: 5, styleIQMaxPerEvent: 1 },
    prestigeYearly: { state: 3, regional: 1, national: 1 },
    ranks: { T0:"Shadow", T1:"Recruit", T2:"Combatant", T3:"Competitor", T4:"Warrior", T5:"Champion", T6:"Commander", T7:"Hero" }
  }
});

// ---- Compat mirror for older code that expects F4/F8 keys ----
export const COMPAT = Object.freeze({
  F4: { caps: XP_CONFIG.foundry4.tierCaps, ranks: XP_CONFIG.foundry4.ranks },
  F8: { caps: XP_CONFIG.foundry8.tierCaps, ranks: XP_CONFIG.foundry8.ranks }
});

export const STRIPES_PER_TIER = 4;

// Alias for older pages that import baseFromTrackLike
export function baseFromTrackLike(code = "") {
  return baseFromTrackCode(code);
}

// ---- Helpers ----
export function baseFromTrackCode(code = "") {
  const c = String(code).toUpperCase();
  return (c.startsWith("F8") || c.includes("FOUNDRY8")) ? "F8" : "F4";
}

export function normalizeBase(b = "F4") {
  const s = String(b).toLowerCase();
  if (s.startsWith("f8") || s.includes("foundry8")) return "F8";
  return "F4";
}

export function getCap(trackBaseOrKey, tier = "T0") {
  const base = normalizeBase(trackBaseOrKey);
  return (base === "F8"
    ? XP_CONFIG.foundry8.tierCaps[tier]
    : XP_CONFIG.foundry4.tierCaps[tier]
  ) ?? 800;
}

export function getRank(trackBaseOrKey, tier = "T0") {
  const base = normalizeBase(trackBaseOrKey);
  return (base === "F8"
    ? XP_CONFIG.foundry8.ranks[tier]
    : XP_CONFIG.foundry4.ranks[tier]
  ) ?? (base === "F8" ? "Shadow" : "Apprentice");
}

export function stripeStep(trackBaseOrKey, tier = "T0") {
  const cap = getCap(trackBaseOrKey, tier);
  return Math.max(1, Math.round(cap / STRIPES_PER_TIER / 10) * 10);
}

// Convenience
export const TRACKS = Object.freeze({ F4: "foundry4", F8: "foundry8" });
export const XP_CONFIG_COMPAT = Object.freeze({ F4: COMPAT.F4, F8: COMPAT.F8 });
