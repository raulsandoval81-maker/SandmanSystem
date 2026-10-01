// /intake-shared/token.js
// Intake Split (Parent/Coach/Athlete) — token helpers + compatibility wrappers
import { verifyToken as _verifyToken } from "/system/intake/intake.tokens.js";
import {
  functions,
  httpsCallable,
} from "/intake-shared/fire.js";

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

function enrollmentPrefillNeedsRefresh(result) {
  const token = result?.token || {};

  if (
    String(token.workflowVersion || "").trim().toLowerCase() !== "intake-v2" ||
    String(token.source || "").trim().toLowerCase() !== "management_enrollment" ||
    String(token.mode || "new_athlete").trim().toLowerCase() !== "new_athlete"
  ) {
    return false;
  }

  const prefill =
    token.prefill && typeof token.prefill === "object"
      ? token.prefill
      : {};

  // These fields are already collected before Enrollment and should not
  // become fresh family data-entry work merely because a locked proposal
  // snapshot was partial.
  return [
    "city",
    "state",
    "email",
    "phone",
  ].some((key) => !String(prefill[key] || "").trim());
}

async function refreshEnrollmentPrefill(result) {
  if (!result?.tokenId || !enrollmentPrefillNeedsRefresh(result)) {
    return result;
  }

  try {
    const hydrate = httpsCallable(
      functions,
      "hydrateEnrollmentIntakePrefill"
    );

    await hydrate({
      tokenId: result.tokenId,
    });

    // Read the token again after the trusted backend has merged the safe
    // proposal/appointment fields into its prefill snapshot.
    return await validateToken(result.tokenId);
  } catch (error) {
    // Prefill convenience must never invalidate an otherwise legitimate
    // enrollment invite. Missing fields remain editable if hydration fails.
    console.warn(
      "[token] enrollment prefill refresh failed:",
      error
    );
    return result;
  }
}

/**
 * Throws if token missing/invalid/expired.
 * Returns: { token, tokenId, exp, forTrack, forLane }
 */
export async function requireValidInvite(token) {
  const raw = String(token ?? "").trim() || String(tokenFromUrl() ?? "").trim();

  console.log("[token] search=", window.location.search, "raw=", raw);

  if (!raw) throw new Error("Missing invite token in URL.");

  let res = await validateToken(raw);

  if (res?.valid) {
    res = await refreshEnrollmentPrefill(res);
  }

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
    rawToken: raw,
    token: res?.token || {},
    tokenId,
    exp: res?.exp ?? null,
    forTrack: res?.forTrack ?? null,
    forLane: res?.forLane ?? null,
  };
}
