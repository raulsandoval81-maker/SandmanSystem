export const DECAY_RELAUNCH_ID = "2026-production-decay-relaunch";
export const DECAY_RELAUNCH_REASON = "2026 production decay relaunch";
export const DECAY_RELAUNCH_HISTORY_KEY = "productionDecayRelaunch2026";
export const DECAY_RELAUNCH_BASELINE_ISO = "2026-09-23T07:00:00.000Z";

const DECAY_STATES = new Set(["CLEAR", "WARNING", "DECAY_ACTIVE", "FROZEN"]);
const HISTORICAL_FIELDS = Object.freeze([
  "state", "hits", "points", "startedAt", "lastHitAt", "nextHitAt",
  "recoveryProgress", "recoveryDaysCompleted", "recoveryDaysRequired",
  "recoveryLog", "clearedAt", "resolutionStatus", "resolutionReason",
  "reason", "rolloutMode", "warningAt", "lastUpdatedAt",
]);

const own = (value, field) => Object.prototype.hasOwnProperty.call(value ?? {}, field);
const clean = (value) => String(value ?? "").trim();

function validTimestamp(value) {
  if (value == null) return true;
  if (typeof value?.toDate === "function") return Number.isFinite(value.toDate().getTime());
  return Number.isFinite(new Date(value).getTime());
}

function validNonnegativeNumber(value) {
  return value == null || (Number.isFinite(Number(value)) && Number(value) >= 0);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const converted = value.toDate();
    return Number.isFinite(converted.getTime()) ? converted : null;
  }
  const converted = new Date(value);
  return Number.isFinite(converted.getTime()) ? converted : null;
}

export function resolveRelaunchActivityAnchor(athlete) {
  const baseline = toDate(athlete?.decay?.decayBaselineAt);
  if (!baseline) return null;
  const activity = toDate(athlete?.lastAttendanceAt || athlete?.lastCombatActivityAt);
  return activity && activity > baseline ? activity : baseline;
}

export function validateDecayRelaunchAthlete(athleteId, athlete) {
  const errors = [];
  if (!clean(athleteId)) errors.push("ATHLETE_ID_REQUIRED");
  if (!athlete || typeof athlete !== "object" || Array.isArray(athlete)) {
    errors.push("ATHLETE_DOCUMENT_MALFORMED");
    return errors;
  }
  if (athlete.decay != null && (typeof athlete.decay !== "object" || Array.isArray(athlete.decay))) {
    errors.push("DECAY_OBJECT_MALFORMED");
    return errors;
  }
  const decay = athlete.decay ?? {};
  const state = clean(decay.state).toUpperCase();
  if (state && !DECAY_STATES.has(state)) errors.push("DECAY_STATE_INVALID");
  if (!validNonnegativeNumber(decay.hits)) errors.push("DECAY_HITS_INVALID");
  if (!validNonnegativeNumber(decay.points)) errors.push("DECAY_POINTS_INVALID");
  if (!validNonnegativeNumber(decay.recoveryProgress)) errors.push("RECOVERY_PROGRESS_INVALID");
  if (!validNonnegativeNumber(decay.recoveryDaysCompleted)) errors.push("RECOVERY_DAYS_INVALID");
  for (const field of ["startedAt", "lastHitAt", "nextHitAt", "clearedAt", "warningAt", "lastUpdatedAt", "decayBaselineAt"]) {
    if (!validTimestamp(decay[field])) errors.push(`${field.toUpperCase()}_INVALID`);
  }
  const marker = clean(decay.relaunchMigrationId);
  if (marker && marker !== DECAY_RELAUNCH_ID) errors.push("OTHER_RELAUNCH_MARKER_PRESENT");
  return errors;
}

export function historicalDecaySnapshot(athlete, migratedAt) {
  const decay = athlete?.decay ?? {};
  const previous = {};
  for (const field of HISTORICAL_FIELDS) {
    if (own(decay, field)) previous[field] = decay[field];
  }
  return Object.freeze({
    migrationId: DECAY_RELAUNCH_ID,
    migratedAt,
    resetReason: DECAY_RELAUNCH_REASON,
    previous,
    previousOperationalLocks: Object.freeze({
      tierStatus: athlete?.tierStatus ?? null,
      promotionLocked: athlete?.promotionLocked ?? null,
      freezeUntil: athlete?.freezeUntil ?? null,
    }),
  });
}

export function planDecayRelaunch(athleteId, athlete, { baseline, migratedAt } = {}) {
  const errors = validateDecayRelaunchAthlete(athleteId, athlete);
  if (errors.length) return Object.freeze({ athleteId, status: "ERROR", errors });
  const decay = athlete.decay ?? {};
  if (clean(decay.relaunchMigrationId) === DECAY_RELAUNCH_ID) {
    return Object.freeze({ athleteId, status: "ALREADY_MIGRATED", patch: null });
  }
  const history = decay.history && typeof decay.history === "object" && !Array.isArray(decay.history)
    ? decay.history
    : {};
  if (own(history, DECAY_RELAUNCH_HISTORY_KEY)) {
    return Object.freeze({ athleteId, status: "ERROR", errors: ["HISTORY_EXISTS_WITHOUT_MIGRATION_MARKER"] });
  }
  const snapshot = historicalDecaySnapshot(athlete, migratedAt);
  const nextDecay = {
    ...decay,
    history: { ...history, [DECAY_RELAUNCH_HISTORY_KEY]: snapshot },
    state: "CLEAR",
    hits: 0,
    points: 0,
    startedAt: null,
    lastHitAt: null,
    nextHitAt: null,
    warningAt: null,
    clearedAt: null,
    recoveryProgress: 0,
    recoveryDaysCompleted: 0,
    recoveryLog: [],
    resolutionStatus: null,
    resolutionReason: null,
    reason: null,
    rolloutMode: null,
    decayBaselineAt: baseline,
    resetReason: DECAY_RELAUNCH_REASON,
    relaunchMigrationId: DECAY_RELAUNCH_ID,
    relaunchedAt: migratedAt,
    lastUpdatedAt: migratedAt,
  };
  return Object.freeze({
    athleteId,
    status: "WOULD_MIGRATE",
    before: Object.freeze({
      state: decay.state ?? null,
      hits: decay.hits ?? null,
      points: decay.points ?? null,
      nextHitAt: decay.nextHitAt ?? null,
      recoveryProgress: decay.recoveryProgress ?? decay.recoveryDaysCompleted ?? null,
    }),
    after: Object.freeze({
      state: "CLEAR", hits: 0, points: 0, startedAt: null,
      lastHitAt: null, nextHitAt: null, recoveryProgress: 0,
    }),
    patch: Object.freeze({ decay: nextDecay }),
  });
}
