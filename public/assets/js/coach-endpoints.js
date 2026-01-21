// public/assets/js/coach-endpoints.js
// Single source of truth for local emulator + production endpoints.

const host = window.location.hostname;

// Detect local/LAN preview (localhost + private IP ranges)
const isPrivateIp =
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

const isLocalish =
  host === "localhost" ||
  host === "127.0.0.1" ||
  isPrivateIp ||
  window.location.search.includes("emu=1");

// Functions base URL
const FN_BASE = isLocalish
  // Emulators (note: use current host so phone can hit your Mac at 192.168.x.x)
  ? `http://${host}:5001/sandmandashboard/us-central1`
  // Production (when you later deploy functions)
  : `https://us-central1-sandmandashboard.cloudfunctions.net`;

export const XP_URL       = `${FN_BASE}/incrementXpHttp`;
export const ARENA_URL    = `${FN_BASE}/logArenaHttp`;
export const ADD_NOTE_URL = `${FN_BASE}/addCoachNote`;

// Optional: expose base for debugging
export const FN_BASE_URL = FN_BASE;
export const USING_EMU = isLocalish;
