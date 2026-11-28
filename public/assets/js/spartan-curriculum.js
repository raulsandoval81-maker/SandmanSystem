/**
 * Sprint 4 Spartan curriculum adapter (read-only).
 *
 * Spartan is a new development path. F4/F8 are legacy content source labels,
 * not new rank or XP authorities. Consumers must independently enforce the
 * established athlete/guardian and remote-assignment access rules.
 */
export const SPARTAN_LEVEL_COUNT = 6;
export const SPARTAN_AVAILABLE_LEVELS = Object.freeze([1, 2, 3]);
export const SPARTAN_ENTRY_LEVEL = 1;

const TRACKS = Object.freeze({
  f4: "teen-adult",
  f8: "youth",
});

export function resolveSpartanCurriculum({ track, level = SPARTAN_ENTRY_LEVEL } = {}) {
  const key = String(track ?? "").trim().toLowerCase();
  if (!Object.hasOwn(TRACKS, key)) return null;
  if (!Number.isInteger(level) || level < 1 || level > SPARTAN_LEVEL_COUNT) return null;
  return Object.freeze({
    program: "spartan",
    level,
    track: key,
    audience: TRACKS[key],
    available: SPARTAN_AVAILABLE_LEVELS.includes(level),
    sourcePath: SPARTAN_AVAILABLE_LEVELS.includes(level)
      ? `/vault/conditioning/${key}/segment${level}/sessions.json` : null,
  });
}

/**
 * New Spartan participation starts at level 1 regardless of existing
 * Conditioning segment, Sandman Journey tier, rank or Active Rank XP.
 * Access is not granted here; the existing eligibility gate remains binding.
 */
export function resolveSpartanEntry(track) {
  return resolveSpartanCurriculum({ track, level: SPARTAN_ENTRY_LEVEL });
}

function validSecondValue(value) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= 600;
}

export function normalizeSpartanSession(session, { track, level = 1 } = {}) {
  const source = resolveSpartanCurriculum({ track, level });
  if (!source?.available || !session || typeof session !== "object") return null;

  const interval = session.interval;
  // Youth Level 3 stores its approved work/rest seconds as "40/20".
  const legacyPair = typeof interval === "string"
    ? /^(\d{1,3})\/(\d{1,3})$/.exec(interval) : null;
  const workSec = Number(legacyPair?.[1] ?? interval?.workSec ?? interval?.work);
  const restSec = Number(legacyPair?.[2] ?? interval?.restSec ?? interval?.rest);
  const rounds = Number(session.rounds);
  const sequence = Array.isArray(session.sequence) ? [...session.sequence] : [];
  const sessionN = Number(session.n ?? session.sessionN);
  if (!Number.isInteger(sessionN) || sessionN < 1 ||
      !validSecondValue(workSec) || workSec === 0 ||
      !validSecondValue(restSec) ||
      !Number.isInteger(rounds) || rounds < 1 || rounds > 30 ||
      sequence.length === 0 || sequence.some(move => typeof move !== "string" || !move.trim())) {
    return null;
  }
  return {
    program: "spartan",
    level,
    track: source.track,
    audience: source.audience,
    sessionN,
    title: String(session.title || session.lesson || `Spartan Session ${sessionN}`),
    interval: { workSec, restSec },
    rounds,
    movesPerCycle: Number.isInteger(Number(session.movesPerCycle))
      && Number(session.movesPerCycle) > 0
      ? Number(session.movesPerCycle) : sequence.length,
    sequence,
    questions: Array.isArray(session.questions) ? [...session.questions] : [],
    // Preserve original coaching fields without silently rewriting exercise prescriptions.
    original: session,
  };
}
