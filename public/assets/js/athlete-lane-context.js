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
