// public/assets/js/tracks.js
import { XP_CONFIG } from "/assets/js/xp.config.js";
import { LADDER }    from "/assets/js/xp-ladder.js";



// Normalize "T3" | 3 → "T3"
function toTierKey(tier) {
  if (typeof tier === "string") {
    return tier.toUpperCase().startsWith("T") ? tier.toUpperCase() : ("T" + parseInt(tier,10));
  }
  return "T" + (tier|0);
}

// Rank name (e.g., "Warrior")
export function rankName(track, tier) {
  const t = track?.toLowerCase();
  const key = toTierKey(tier);
  return LADDER[t]?.names?.[key] || "Apprentice";
}

// Rank color hex (by name)
export function rankColor(track, tier) {
  const name = rankName(track, tier);
  const t = track?.toLowerCase();
  return LADDER[t]?.colors?.[name] || "#ffffff";
}

// XP cap for that tier (from rules config)
export function xpCap(track, tier) {
  const t = track?.toLowerCase();
  const key = toTierKey(tier);
  return XP_CONFIG[t]?.tierCaps?.[key] ?? 0;
}

// Optional: arena/monthly helpers (pass-throughs)
export function arenaMonthlyCap(track, tier) {
  const t = track?.toLowerCase();
  const key = toTierKey(tier);
  return XP_CONFIG[t]?.monthly?.arena?.[key] ?? 0;
}
export function attendanceCaps(track) {
  const t = track?.toLowerCase();
  const m = XP_CONFIG[t]?.monthly || {};
  return { posCap: m.attendance, fishMax: m.attendanceNegFishEventsMax };
}
// make sure this is a NAMED export (no "default")
export const TRACKS = {
  foundry4: { code: "foundry4", label: "Foundry 4 (Teen/Adult)" },
  foundry8: { code: "foundry8", label: "Foundry 8 (Youth)" },
};

// optional helpers
export const TRACK_ORDER = ["foundry4","foundry8"];
export function getTrack(code){ return TRACKS[code?.toLowerCase()] || null; }
