// /assets/js/virtues.js
// ----------------------------------------------------------
// Canonical track codes
// ----------------------------------------------------------
export const TRACK_F4 = "foundry4-combat";
export const TRACK_F8 = "foundry8-combat";
// still defined, but not public

// ----------------------------------------------------------
// One source of truth for virtue tags (exact strings to mint)
// ----------------------------------------------------------

// Foundry 4 (older)
export const VIRTUES_F4 = [
  "INTEGRITY","PATIENCE","DISCIPLINE","HONOR","WISDOM",
  "STRENGTH","COMBAT","TENACITY","TIMING","PRECISION"
];

// Foundry 8 (youth)
export const VIRTUES_F8 = [
  "FOCUS","EFFORT","ATTITUDE","RESPECT","RESILIENCE",
  "SPEED","AGILITY","COURAGE","POWER"
];

// Map of track → virtue list
export const VIRTUES_BY_TRACK = {
  [TRACK_F4]: VIRTUES_F4,
  [TRACK_F8]: VIRTUES_F8,
  // legacy aliases
  "foundry4": VIRTUES_F4,
  "foundry8": VIRTUES_F8,
};

// ----------------------------------------------------------
// Normalizers so old inputs or typos don't corrupt mints
// ----------------------------------------------------------
const MAP_EQUIV = new Map([
  ["RESILIENCE","RESILIENCE"],
  ["RESILIENT","RESILIENCE"],
  ["GRIT","TENACITY"],
  ["STRONG","STRENGTH"],
  ["FAST","SPEED"],
  ["AGILE","AGILITY"],
  // FEAR stays valid for F4; only map to COURAGE if youth track
]);

export function normalizeVirtue(raw, track = "") {
  if (!raw) return "";
  const v = String(raw).trim().toUpperCase();
  if (track.startsWith("foundry8") && v === "FEAR") return "COURAGE";
  return MAP_EQUIV.get(v) ?? v;
}

// ----------------------------------------------------------
// Mint Virtue Codes (from official virtue lists)
// ----------------------------------------------------------
export const CODE_BY_NAME_F4 = {
  INTEGRITY: "IN",
  PATIENCE: "PT",
  DISCIPLINE: "DS",
  HONOR: "HN",
  WISDOM: "WS",
  STRENGTH: "ST",
  COMBAT: "CB",
  TENACITY: "TN",
  TIMING: "TM",
  PRECISION: "PR",
};

export const CODE_BY_NAME_F8 = {
  FOCUS: "FC",
  EFFORT: "EF",
  ATTITUDE: "AT",
  RESPECT: "RS",
  RESILIENCE: "RL",
  SPEED: "SP",
  AGILITY: "AG",
  COURAGE: "CR",
  POWER: "PW",
};

// Helper to look up the proper two-letter code
export function codeForVirtue(track, virtueName) {
  if (!virtueName) return null;
  const v = String(virtueName).trim().toUpperCase();
  const map = track === TRACK_F4 ? CODE_BY_NAME_F4 : CODE_BY_NAME_F8;
  return map[v] || null;
}

// ----------------------------------------------------------
// Utilities
// ----------------------------------------------------------
export function virtuesFor(track) {
  const list = VIRTUES_BY_TRACK[track];
  if (!list) throw new Error(`Unknown track: ${track}`);
  return list.slice(); // defensive copy
}

export function assertVirtue(track, virtue) {
  const pool = VIRTUES_BY_TRACK[track] ?? [];
  return pool.includes(virtue);
}

// Hide coach-only virtues from public pickers (e.g., FEAR)
const PUBLIC_BLOCKLIST = new Set(["FEAR"]);
export function publicVirtuesFor(track) {
  return virtuesFor(track).filter(v => !PUBLIC_BLOCKLIST.has(v));
}

// ----------------------------------------------------------
// Mint Virtue Tag (UID)
// ----------------------------------------------------------
export function makeMint(track /* 'foundry4-combat'|'foundry8-combat' */, serial, virtue) {
  const t = (track === TRACK_F8 || track === "foundry8") ? "F8" : "F4";
  const serial4 = String(serial).padStart(4, "0");
  return `${t}_${virtue}${serial4}`;
}
