/**
 * Barrel index for Sandman XP wiring.
 * Re-exports Foundry 8, Foundry 4, and Leadership helpers/arrays.
 * Import from here in your UI:  import { getBadge, XP_CONFIG, LEADERSHIP_BADGES, getLeadershipBadge } from "./xp.index.js";
 */

// ---- Central config + universal helpers (if you’re using the config model) ----
export { XP_CONFIG } from "./xp.config.js";
export { getBadge } from "./xp.helpers.js";

// ---- Foundry 8 (youth) wiring (optional if you also use getBadge+config) ----
// If you maintain dedicated files, re-export them here. Otherwise remove these lines.
export { foundry8Badges as F8_BADGES } from "./xp.foundry8.js"; // optional file
export { foundry4Badges as F4_BADGES } from "./xp.foundry4.js"; // optional file

// ---- Leadership track (daylight; no moon overlay) ----
export {
  LEADERSHIP_BADGES,
  getLeadershipBadge,
  getLeadershipAssets
} from "./xp.leadership.js";

// ---- Moon overlay assets (for UI convenience) ----
export const MOON_ASSETS = {
  crescent: "/assets/images/moon/crescent.png",
  first_quarter: "/assets/images/moon/first_quarter.png",
  gibbous: "/assets/images/moon/gibbous.png",
  full: "/assets/images/moon/full_moon.png",
  glow: "/assets/images/moon/full_moon_glow.png"
};
