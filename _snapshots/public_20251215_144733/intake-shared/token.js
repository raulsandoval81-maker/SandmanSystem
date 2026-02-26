// /intake-shared/token.js
// Intake Split (Parent/Coach/Athlete) — token helpers + compatibility wrappers
// Source of truth: tokenFromUrl() + validateToken()

import { verifyToken as _verifyToken } from "/system/intake/intake.tokens.js";

/**
 * Grab token from URL:
 *  ?token=XXXX
 *  ?invite=XXXX
 *  ?code=XXXX
 */
export function tokenFromUrl() {
  const qs = new URLSearchParams(window.location.search);
  return qs.get("token") || qs.get("invite") || qs.get("code") || "";
}

/**
 * Verify a token string (or defaults to token in URL).
 * Returns: { valid: boolean, reason?: string, tokenId?: string, forTrack?: string, forLane?: string, exp?: any }
 */
export async function validateToken(token) {
  const raw = String(token ?? "").trim() || String(tokenFromUrl() ?? "").trim();

  // defensive: handle "ABC+DEF" or copy/paste spaces
  const normalizedInput = raw.replace(/\+/g, " ").trim();

  return await _verifyToken(normalizedInput);
}

// ---------------------------------------------------------------------
// Compatibility wrappers for Intake Split pages (Parent/Coach/Athlete)
// ---------------------------------------------------------------------

/** Alias used by split intake pages */
export function getInviteFromURL() {
  return tokenFromUrl();
}

/**
 * Throws if token missing/invalid/expired.
 * Returns a normalized shape:
 * { token, tokenId, exp, forTrack, forLane }
 *
 * IMPORTANT:
 * - tokenId is the canonical Firestore doc id you should write to (intakes/{tokenId})
 * - token is the raw input (URL param / pasted string), mostly for logging
 */
export async function requireValidInvite(token) {
  const raw = String(token ?? "").trim() || String(tokenFromUrl() ?? "").trim();
  if (!raw) throw new Error("Missing invite token in URL.");

  const res = await validateToken(raw);

  if (!res?.valid) {
    // keep reasons simple + consistent for UI
    const reason = res?.reason || "invalid";
    if (reason === "expired") throw new Error("Invite token expired.");
    if (reason === "used")    throw new Error("Invite token already used.");
    if (reason === "not-found") throw new Error("Invite token not found.");
    throw new Error("Invalid invite token.");
  }

  // Canonical id (what your verifier actually matched after normalization)
  const tokenId = res?.tokenId || null;
  if (!tokenId) throw new Error("Invite token format not recognized.");

  return {
    token: raw,                 // raw input (may be URL or param)
    tokenId,                    // canonical doc id (use this to write/read)
    exp: res?.exp ?? null,      // null if verifier doesn't return it
    forTrack: res?.forTrack ?? null,
    forLane: res?.forLane ?? null,
  };
}
