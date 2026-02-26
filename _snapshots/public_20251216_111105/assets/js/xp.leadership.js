/**
 * Sandman Systems — Foundry 4 Leadership Wiring
 * Track philosophy:
 * - Daylight theme (sun), NOT the moon overlay system
 * - Stable bonsai size across tiers (no growth)
 * - Final tier name = "Master" (reframed: Master your mind)
 * - Image files can be placeholders; keep filenames stable
 *
 * Required images (placeholders OK):
 * /public/assets/images/badges/leadership/
 *   - leadership_apprentice.png
 *   - leadership_mentor.png
 *   - leadership_scholar.png
 *   - leadership_advisor.png   // seedling placeholder is fine
 *   - leadership_master.png    // placeholder for now
 */

export const LEADERSHIP_BADGES = [
  { tier: 0, name: "Apprentice", xpCap: 600,  badge: "leadership_apprentice.png" },
  { tier: 1, name: "Mentor",     xpCap: 1200, badge: "leadership_mentor.png" },
  { tier: 2, name: "Scholar",    xpCap: 1600, badge: "leadership_scholar.png" },
  { tier: 3, name: "Advisor",    xpCap: 2000, badge: "leadership_advisor.png" }, // seedling placeholder OK
  { tier: 4, name: "Master",     xpCap: 2200, badge: "leadership_master.png" }   // placeholder OK
];

/**
 * Returns the current Leadership tier object for a given XP.
 * Unlike Foundry tracks, Leadership uses daylight visuals (no moon overlay/stripes).
 * @param {number} xp
 * @returns {{tier:number,name:string,xpCap:number,badge:string,moonOverlay:null}}
 */
export function getLeadershipBadge(xp) {
  let current = LEADERSHIP_BADGES[0];
  for (let i = LEADERSHIP_BADGES.length - 1; i >= 0; i--) {
    if (xp >= LEADERSHIP_BADGES[i].xpCap) {
      current = LEADERSHIP_BADGES[i];
      break;
    }
  }
  return { ...current, moonOverlay: null }; // Leadership = no moon system
}

/**
 * Helper to build absolute asset paths for the UI.
 * @param {{badge:string}} badgeObj
 * @param {string} basePath default "/assets/images/badges/leadership/"
 * @returns {{badgeImage:string, overlay:null}}
 */
export function getLeadershipAssets(badgeObj, basePath = "/assets/images/badges/leadership/") {
  return {
    badgeImage: `${basePath}${badgeObj.badge}`,
    overlay: null // explicit: leadership has no overlay
  };
}

/** ---------- Example usage (safe to remove) ----------
import { getLeadershipBadge, getLeadershipAssets } from "./xp.leadership.js";

// Example: trainee with 1850 XP
const b = getLeadershipBadge(1850); // → { tier:3, name:"Advisor", ... , moonOverlay:null }
const assets = getLeadershipAssets(b); // → { badgeImage:"/assets/images/badges/leadership/leadership_advisor.png", overlay:null }

// In your UI:
// document.getElementById("leadershipBadge").src = assets.badgeImage;
----------------------------------------------------- */
