/**
 * ARCHIVED — DO NOT USE
 * This file represents an early experimental virtue/mint model.
 * The live system uses virtues.js (single, system-wide virtue list).
 * Archived on 2025-08-26 to prevent accidental reuse.
 */

// virtues-data.js — Sandman Mint v2.0
// Lane-based • 3-letter caps • 4-digit ids • full-word virtues
// Lanes: CB = Combat, LS = Lifestyle, SP = Sports
// Tracks: F8 (Youth), F4 (Teen/Adult)

// ----------------------------------
// Utility: Build a mint tag
// ----------------------------------
export function buildTag(track, lane, num, cap) {
  const n = num.toString().padStart(4, "0");
  return `${track}_${lane}${n}${cap}`;
}

// ----------------------------------
// Virtue lists (Full words + CAPS)
// ----------------------------------
export const VIRTUES = [
  { full: "FOCUS", cap: "FOC" },
  { full: "EFFORT", cap: "EFT" },
  { full: "ATTITUDE", cap: "ATT" },
  { full: "RESPECT", cap: "RES" },
  { full: "SPEED", cap: "SPD" },
  { full: "AGILITY", cap: "AGI" },
  { full: "POWER", cap: "PWR" }
  // COMBAT removed — now a lane, not a virtue
];

// ----------------------------------
// Default lanes (extensible)
// ----------------------------------
export const LANES = {
  CB: "Combat",
  LS: "Lifestyle",
  SP: "Sports"
};

// ----------------------------------
// Generate virtues for a track + lane
// (8 virtues, numbered 0001–0008)
// ----------------------------------
export function generateVirtues(track, lane) {
  return VIRTUES.map((v, i) => {
    const num = i + 1;
    return {
      tag: buildTag(track, lane, num, v.cap),
      virtue: v.full,
      cap: v.cap,
      num
    };
  });
}

// ----------------------------------
// Full exports: F8 + F4 (Combat lane only for now)
// ----------------------------------
export const F8_CB = generateVirtues("F8", "CB");
export const F4_CB = generateVirtues("F4", "CB");

// Future expansions (placeholders):
export const F8_LS = []; // Lifestyle lane (youth)
export const F8_SP = []; // Sports lane (youth)
export const F4_LS = []; // Lifestyle lane (teen/adult)
export const F4_SP = []; // Sports lane (teen/adult)

// ----------------------------------
// Grouped export for UI tools
// ----------------------------------
export const ALL_MINTS = {
  F8: { CB: F8_CB, LS: F8_LS, SP: F8_SP },
  F4: { CB: F4_CB, LS: F4_LS, SP: F4_SP }
};
