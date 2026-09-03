const STRENGTH_PHASES = Object.freeze([
  "preseason",
  "inseason",
  "postseason",
]);

const HONOR_CATEGORIES = Object.freeze([
  "self",
  "teammates",
  "team",
  "competition",
  "leadership",
  "legacy",
]);

const STRENGTH_PHASE_LABELS = Object.freeze({
  preseason: "Preseason",
  inseason: "In-Season",
  postseason: "Postseason",
});

const HONOR_CATEGORY_LABELS = Object.freeze({
  self: "Self",
  teammates: "Teammates",
  team: "Team",
  competition: "Competition",
  leadership: "Leadership",
  legacy: "Legacy",
});

const SEGMENT_ID_PATTERN = /^segment([1-9]\d*)$/;
const LANE_SEGMENT_LIMITS = Object.freeze({ strength: 3, honor: 6 });

export function normalizeLaneSegmentId(value, lane = "") {
  const normalized = String(value || "").trim().toLowerCase();
  const match = normalized.match(SEGMENT_ID_PATTERN);
  if (!match) return null;
  const limit = LANE_SEGMENT_LIMITS[String(lane || "").trim().toLowerCase()];
  return limit && Number(match[1]) > limit ? null : normalized;
}

function identityFromKey(lane, key) {
  const normalizedLane = String(lane || "").trim().toLowerCase();
  const value = String(key || "").trim();
  let match = null;

  if (normalizedLane === "strength") {
    match = value.match(/^STR-(\d+)$/i);
    if (match) return { segmentId: "segment1", sessionN: Number(match[1]) };
    match = value.match(/^STR-CAP-(\d+)$/i);
    if (match) return { segmentId: "segment2", sessionN: Number(match[1]) };
    match = value.match(/^STR-PERF-(\d+)$/i);
    if (match) return { segmentId: "segment3", sessionN: Number(match[1]) };
  }

  if (normalizedLane === "honor") {
    match = value.match(/^HON(\d*)-(\d+)$/i);
    if (match) {
      const segmentNumber = Number(match[1] || 1);
      return { segmentId: `segment${segmentNumber}`, sessionN: Number(match[2]) };
    }
  }

  match = value.match(/^(strength|honor)_segment(\d+)_session(\d+)$/i);
  if (match && match[1].toLowerCase() === normalizedLane) {
    return { segmentId: `segment${Number(match[2])}`, sessionN: Number(match[3]) };
  }

  return { segmentId: null, sessionN: null };
}

export function resolveLaneSubmissionIdentity({ lane, entry = {}, key = "" } = {}) {
  const fallback = identityFromKey(lane, key);
  const normalizedLane = String(lane || "").trim().toLowerCase();
  const segmentId = normalizeLaneSegmentId(entry?.segmentId, normalizedLane) || fallback.segmentId;
  const directSession = Number(entry?.sessionN);
  const sessionN = Number.isInteger(directSession) && directSession > 0
    ? directSession
    : fallback.sessionN;

  return {
    segmentId: normalizeLaneSegmentId(segmentId, normalizedLane),
    sessionN: Number.isInteger(sessionN) && sessionN > 0 ? sessionN : null,
  };
}

export function getCompletedLaneSubmissionIdentities({
  submissions = {},
  lane,
  segmentId,
} = {}) {
  const normalizedLane = String(lane || "").trim().toLowerCase();
  const normalizedSegment = normalizeLaneSegmentId(segmentId, normalizedLane);

  return Object.entries(submissions)
    .map(([key, entry]) => ({
      key,
      entry,
      identity: resolveLaneSubmissionIdentity({ lane: normalizedLane, entry, key }),
    }))
    .filter(({ entry, identity }) => {
      const status = String(entry?.status || "").trim().toLowerCase();
      return String(entry?.lane || "").trim().toLowerCase() === normalizedLane &&
        identity.segmentId === normalizedSegment &&
        (status === "approved" || status === "closed");
    })
    .sort((a, b) => Number(b.identity.sessionN || 0) - Number(a.identity.sessionN || 0));
}

export function findExactLaneSession(sessions = [], sessionN) {
  const target = Number(sessionN);
  if (!Number.isInteger(target) || target < 1) return null;
  return sessions.find((session) =>
    Number(session?.sessionN ?? session?.n) === target
  ) || null;
}

function acceptedValue(value, allowed) {
  const normalized = String(value || "").trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : null;
}

export function normalizeStrengthPhase(value) {
  return acceptedValue(value, STRENGTH_PHASES);
}

export function normalizeHonorCategory(value) {
  return acceptedValue(value, HONOR_CATEGORIES);
}

export function resolveStrengthPhase({
  operationalPhase = null,
  systemStatusPhase = null,
  segmentPhase = null,
} = {}) {
  return (
    normalizeStrengthPhase(operationalPhase) ||
    normalizeStrengthPhase(systemStatusPhase) ||
    normalizeStrengthPhase(segmentPhase) ||
    "postseason"
  );
}

async function fetchJsonOrNull(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function loadStrengthPhaseContext({
  operationalPhase = null,
  operationalPhaseLoader = null,
  fetchImpl = globalThis.fetch,
  systemStatusUrl = "/vault/system-status.json",
  segmentMetaUrl = "/vault/strength/segment1/segment1.meta.json",
} = {}) {
  let loadedOperationalPhase = operationalPhase;
  if (!normalizeStrengthPhase(loadedOperationalPhase) && typeof operationalPhaseLoader === "function") {
    try {
      loadedOperationalPhase = await operationalPhaseLoader();
    } catch {
      loadedOperationalPhase = null;
    }
  }

  if (typeof fetchImpl !== "function") {
    const validOperational = normalizeStrengthPhase(loadedOperationalPhase);
    return {
      phase: resolveStrengthPhase({ operationalPhase: validOperational }),
      source: validOperational ? "operational" : "fallback",
    };
  }

  const [systemStatus, segmentMeta] = await Promise.all([
    fetchJsonOrNull(fetchImpl, systemStatusUrl),
    fetchJsonOrNull(fetchImpl, segmentMetaUrl),
  ]);

  const validOperational = normalizeStrengthPhase(loadedOperationalPhase);
  const validSystem = normalizeStrengthPhase(systemStatus?.strength?.seasonPhase);
  const validSegment = normalizeStrengthPhase(segmentMeta?.phase);

  return {
    phase: resolveStrengthPhase({
      operationalPhase: validOperational,
      systemStatusPhase: validSystem,
      segmentPhase: validSegment,
    }),
    source: validOperational
      ? "operational"
      : validSystem
        ? "system-status"
        : validSegment
          ? "segment-meta"
          : "fallback",
  };
}

export function resolveStrengthSeasonBlock(workout, phase) {
  const resolved = normalizeStrengthPhase(phase);
  if (!resolved) return null;
  return workout?.seasonBlocks?.[resolved] || null;
}

export function strengthContextTitle(phase, sessionN) {
  const resolved = resolveStrengthPhase({ operationalPhase: phase });
  const label = STRENGTH_PHASE_LABELS[resolved];
  return `Strength · ${label} · Session ${Number(sessionN)}`;
}

export function honorContextTitle(category, sessionN) {
  const resolved = normalizeHonorCategory(category);
  const suffix = resolved ? ` · ${HONOR_CATEGORY_LABELS[resolved]}` : "";
  return `Honor${suffix} · Session ${Number(sessionN)}`;
}

export {
  HONOR_CATEGORIES,
  HONOR_CATEGORY_LABELS,
  STRENGTH_PHASES,
  STRENGTH_PHASE_LABELS,
};
