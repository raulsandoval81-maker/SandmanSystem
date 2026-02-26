// public/assets/js/coach-endpoints.js
// Single source of truth for endpoints.
// RULE: Browser pages call SAME-ORIGIN paths to avoid CORS.
// Hosting rewrites forward to Functions (emulator + prod).

export const XP_URL       = "/xp";
export const ARENA_URL    = "/arena";
export const ADD_NOTE_URL = "/note";

// Optional debug
const host = window.location.hostname;

// local private IPs (LAN)
const isPrivateIp =
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

// explicit override: ?emu=1
const emuOverride = (() => {
  try {
    return new URLSearchParams(window.location.search).get("emu") === "1";
  } catch {
    return false;
  }
})();

export const USING_EMU =
  host === "localhost" ||
  host === "127.0.0.1" ||
  isPrivateIp ||
  emuOverride;
export function debugEndpoints(){
  console.log("[coach-endpoints] host=", window.location.hostname);
  console.log("[coach-endpoints] USING_EMU=", USING_EMU);
  console.log("[coach-endpoints] XP_URL=", XP_URL, "ARENA_URL=", ARENA_URL, "ADD_NOTE_URL=", ADD_NOTE_URL);
}
