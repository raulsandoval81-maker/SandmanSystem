// /assets/js/virtues.js
// ----------------------------------------------------------
// Canonical track codes
// ----------------------------------------------------------
export const TRACK_F4 = "foundry4-combat";
export const TRACK_F8 = "foundry8-combat";

// ----------------------------------------------------------
// ✅ ONE unified virtue pool for the whole system
// (no separate muddy lists)
// ----------------------------------------------------------
export const VIRTUES_UNIFIED = [
  "HONOR",
  "COURAGE",
  "DISCIPLINE",
  "INTEGRITY",
  "PATIENCE",
  "WISDOM",
  "STRENGTH",
  "TENACITY",
  "ACCOUNTABILITY",
  "STEWARDSHIP",
];

// Both tracks use the same pool (locked)
export const VIRTUES_BY_TRACK = {
  [TRACK_F4]: VIRTUES_UNIFIED,
  [TRACK_F8]: VIRTUES_UNIFIED,
  // legacy aliases
  "foundry4": VIRTUES_UNIFIED,
  "foundry8": VIRTUES_UNIFIED,
};

// ----------------------------------------------------------
// Normalizers (safe typos / old words)
// ----------------------------------------------------------
const MAP_EQUIV = new Map([
  ["RESILIENT", "TENACITY"],
  ["RESILIENCE", "TENACITY"],
  ["GRIT", "TENACITY"],
  ["ACCOUNTABLE", "ACCOUNTABILITY"],
  ["STEWARD", "STEWARDSHIP"],
]);

export function normalizeVirtue(raw) {
  if (!raw) return "";
  const v = String(raw).trim().toUpperCase();
  return MAP_EQUIV.get(v) ?? v;
}

// ----------------------------------------------------------
// Optional: 2-letter codes (you can keep for metadata)
// Not used for your SHORT mint (F4_CB0001_HONOR), but harmless.
// ----------------------------------------------------------
export const CODE_BY_NAME = {
  HONOR: "HN",
  COURAGE: "CR",
  DISCIPLINE: "DS",
  INTEGRITY: "IN",
  PATIENCE: "PT",
  WISDOM: "WS",
  STRENGTH: "ST",
  TENACITY: "TN",
  ACCOUNTABILITY: "AC",
  STEWARDSHIP: "SW",
};

export function codeForVirtue(_track, virtueName) {
  if (!virtueName) return null;
  const v = String(virtueName).trim().toUpperCase();
  return CODE_BY_NAME[v] || null;
}

// ----------------------------------------------------------
// Utilities
// ----------------------------------------------------------
export function virtuesFor(track) {
  const list = VIRTUES_BY_TRACK[track];
  if (!list) throw new Error(`Unknown track: ${track}`);
  return list.slice();
}

export function assertVirtue(track, virtue) {
  const pool = VIRTUES_BY_TRACK[track] ?? [];
  return pool.includes(virtue);
}
