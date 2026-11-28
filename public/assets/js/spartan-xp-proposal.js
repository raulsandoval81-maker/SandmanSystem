/**
 * Sprint 4 Spartan XP proposal policy — PURE / NOT AN AWARD AUTHORITY.
 *
 * This function is intentionally side-effect-free. All inputs are untrusted
 * unless a future server-side Coach-authorized transaction reads the canonical
 * athlete, assignment, approved completion and immutable award receipt.
 * Never call the XP endpoint using client-provided values from this adapter.
 *
 * Current unresolved policy: 30–44 minute workouts have no approved award.
 * STOP rather than infer 5 or 10 XP. Youth F8 keeps the existing +5 ceiling.
 */
export function proposeSpartanStrengthXp({
  track,
  level,
  sessionN,
  durationMinutes,
  coachVerified,
  completionStatus,
} = {}) {
  const normalizedTrack = String(track ?? "").toLowerCase();
  if (!["f8", "f4"].includes(normalizedTrack)) return null;
  if (!Number.isInteger(level) || level < 1 || level > 3) return null;
  if (!Number.isInteger(sessionN) || sessionN < 1) return null;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) return null;
  if (coachVerified !== true || completionStatus !== "approved") return null;

  // Coaching & youth safeguards precede any duration-based award.
  if (normalizedTrack === "f8") {
    if (durationMinutes > 30) return null;
    return Object.freeze({
      program: "spartan",
      xpLane: "strength",
      xpKind: "STRENGTH",
      track: normalizedTrack, level, sessionN,
      proposalXp: 5,
      // Source identities are distinct from legacy conditioning_* submissions.
      sourceIdentity: `spartan:f8:level${level}:session${sessionN}`,
    });
  }

  if (durationMinutes >= 30 && durationMinutes < 45) return null;
  if (durationMinutes > 45) return null; // only an approved 45-minute session gets 10.
  return Object.freeze({
    program: "spartan",
    xpLane: "strength",
    xpKind: "STRENGTH",
    track: normalizedTrack, level, sessionN,
    proposalXp: durationMinutes === 45 ? 10 : 5,
    sourceIdentity: `spartan:f4:level${level}:session${sessionN}`,
  });
}
