// public/system/intake/intake.tokens.js
// Intake Token Verification (v1.1)
// Purpose: Validate, read, and burn intake tokens
// Scope: Intake ONLY (parent + coach review)
// Rules: No Para-Comms, no backend refactors

import { db, doc, getDoc, updateDoc, serverTimestamp } from "/intake-shared/fire.js";

/**
 * Supported token formats:
 *
 *  - ?invite=ABCDEFG
 *  - ?token=ABCDEFG
 *  - ?code=ABCDEFG
 *  - ABCDEFG
 *  - F8-ABCDEFG
 *  - F4-ABCDEFG
 *  - Full URLs containing any of the above
 *
 * Notes:
 *  - Prefixes (F8-, F4-, INT-) are allowed but stripped before lookup
 *  - Lookup is case-insensitive
 *  - Firestore stores ONLY the core token ID
 */
export async function verifyToken(input) {
  const tokenId = extractToken(input);
  if (!tokenId) return { valid: false, reason: "bad-format" };

  const snap = await getDoc(doc(db, "intakes", tokenId));
  if (!snap.exists()) return { valid: false, reason: "not-found" };

  const data = snap.data() || {};

  // Expired
  const expMs =
    data.expiresAt?.toMillis?.() ??
    (typeof data.expiresAt === "number" ? data.expiresAt : null);

  if (expMs && expMs < Date.now()) {
    return { valid: false, reason: "expired" };
  }

  // Already used
  if (data.used === true) {
    return { valid: false, reason: "used" };
  }

  return {
    valid: true,
    tokenId,
    forTrack: data.forTrack ?? null,
    forLane: data.forLane ?? null,
  };
}

/**
 * Mark token as used after successful coach approval.
 * Called from Coach Review (Step 6).
 */
export async function markTokenUsed(tokenId) {
  const id = normalizeToken(tokenId);
  if (!id) throw new Error("bad-format");
  await updateDoc(doc(db, "intakes", id), {
    used: true,
    usedAt: serverTimestamp(),
  });
}

/**
 * Extract token from any format a parent might paste.
 */
function extractToken(raw) {
  if (!raw) return null;

  const text = String(raw).trim();

  // Match query params: invite=, token=, code=
  const paramMatch = text.match(/(?:invite|token|code)=([A-Za-z0-9-]+)/i);
  if (paramMatch) return normalizeToken(paramMatch[1]);

  // Full URL parsing (defensive)
  if (text.includes("http")) {
    try {
      const url = new URL(text);
      for (const key of ["invite", "token", "code"]) {
        const val = url.searchParams.get(key);
        if (val) return normalizeToken(val);
      }
    } catch {
      // fall through
    }
  }

  // Raw token pasted
  return normalizeToken(text);
}

/**
 * Normalize token:
 *  - strips known prefixes
 *  - uppercases
 *  - validates core token
 */
function normalizeToken(token) {
  if (!token) return null;

  const cleaned = String(token)
    .toUpperCase()
    .trim()
    .replace(/^(F8-|F4-|INT-)/, "");

  // Core token validation (adjust length here if desired)
  if (/^[A-Z0-9]{6,16}$/.test(cleaned)) return cleaned;

  return null;
}
