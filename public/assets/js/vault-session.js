// public/assets/js/vault-session.js
// V1-safe vault loader that supports BOTH session key styles:
// - numeric: { n: 1 }   (your current vault)
// - string:  { id: "session1" } (optional future)
//
// Also supports both JSON shapes:
// - { sessions: [...] }
// - [ ... ]

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`Vault fetch failed: ${res.status} ${res.statusText}`);
    err.url = url;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function loadVaultSessions({ lane, segmentId }) {
  if (!lane) throw new Error("loadVaultSessions: missing lane");
  if (!segmentId) throw new Error("loadVaultSessions: missing segmentId");

  const url = `/vault/${lane}/${segmentId}/sessions.json`;
  const data = await fetchJson(url);

  const list = Array.isArray(data) ? data : (data.sessions || []);
  return { url, sessions: list };
}

// wanted can be: 1, "1", "session1", "Session 1", etc.
export function pickSession(sessions, wanted) {
  const w = String(wanted ?? "").trim();
  if (!w) return null;

  // parse digits out (session1 -> 1)
  const num = Number(w.replace(/[^\d]/g, "")) || null;

  // Try string id first
  let found = sessions.find((s) => String(s?.id || "").trim() === w);
  if (found) return found;

  // Try numeric n next
  if (num != null) {
    found = sessions.find((s) => Number(s?.n) === num);
    if (found) return found;
  }

  // Last resort: if they asked for session1 and we have array index 0
  if (num === 1 && sessions.length) return sessions[0];

  return null;
}