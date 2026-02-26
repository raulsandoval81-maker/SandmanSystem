// /intake-shared/token.js
// Intake Split (Parent/Coach/Athlete) — token helpers + compatibility wrappers
import { verifyToken as _verifyToken } from "/system/intake/intake.tokens.js";

/**
 * Grab token from URL:
 *  ?invite=XXXX
 *  ?token=XXXX
 *  ?code=XXXX
 */
export function tokenFromUrl() {
  const qs = new URLSearchParams(window.location.search);
  return (qs.get("invite") || qs.get("token") || qs.get("code") || "").trim();
}

/** Alias used by split intake pages */
export function getInviteFromURL() {
  return tokenFromUrl();
}

/**
 * Verify a token string (or defaults to token in URL).
 * Returns whatever your verifier returns (expected: {valid, reason, tokenId, exp, ...})
 */
export async function validateToken(token) {
  const raw = String(token ?? "").trim() || String(tokenFromUrl() ?? "").trim();
  const normalizedInput = raw.replace(/\+/g, " ").trim();
  return await _verifyToken(normalizedInput);
}

/**
 * Throws if token missing/invalid/expired.
 * Returns: { token, tokenId, exp, forTrack, forLane }
 */
export async function requireValidInvite(token) {
  const raw = String(token ?? "").trim() || String(tokenFromUrl() ?? "").trim();

  // DEBUG
  console.log("[token] search=", window.location.search, "raw=", raw);

  if (!raw) throw new Error("Missing invite token in URL.");

  const res = await validateToken(raw);

  // DEBUG
  console.log("[token] verifyToken res=", res);

  if (!res?.valid) {
    const reason = res?.reason || "invalid";
    if (reason === "expired") throw new Error("Invite token expired.");
    if (reason === "used") throw new Error("Invite token already used.");
    if (reason === "not-found") throw new Error("Invite token not found.");
    throw new Error("Invalid invite token.");
  }

  const tokenId = res?.tokenId || null;
  if (!tokenId) throw new Error("Invite token format not recognized.");

  return {
    token: raw,
    tokenId,
    exp: res?.exp ?? null,
    forTrack: res?.forTrack ?? null,
    forLane: res?.forLane ?? null,
  };
}
