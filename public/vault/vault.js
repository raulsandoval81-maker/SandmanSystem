// public/vault/vault.js

/* --------------------------------
   JSON fetch helper
-------------------------------- */

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return await res.json();
}

/* --------------------------------
   Lane normalization
-------------------------------- */

function normLane(lane) {
  const x = String(lane || "").trim().toLowerCase();

  if (!["honor", "strength"].includes(x)) {
    throw new Error(`Unknown lane: ${lane}`);
  }

  return x;
}

/* --------------------------------
   Lane index cache
-------------------------------- */

const laneIndexCache = {};
const sourceCache = {};

/* --------------------------------
   Load lane index (cached)
-------------------------------- */

async function getLaneIndex(lane) {
  const L = normLane(lane);

  if (laneIndexCache[L]) {
    return laneIndexCache[L];
  }

  const idx = await fetchJson(`/vault/${L}/index.json`);
  laneIndexCache[L] = idx;

  return idx;
}

/* --------------------------------
   Segment normalization
-------------------------------- */

async function normSegment(lane, seg) {
  const laneIndex = await getLaneIndex(lane);

  const raw = String(seg || "").trim().toLowerCase();

  const aliases = {
    "1": "segment1",
    "2": "segment2",
    "3": "segment3",
    "4": "segment4",
    "5": "segment5",
    "6": "segment6",
    "seg1": "segment1",
    "seg2": "segment2",
    "seg3": "segment3",
    "seg4": "segment4",
    "seg5": "segment5",
    "seg6": "segment6"
  };

  const normalized = aliases[raw] || raw;

  const allowed = Array.isArray(laneIndex?.segments)
    ? laneIndex.segments
    : [];

  if (!allowed.includes(normalized)) {
    throw new Error(`Unknown segment for ${lane}: ${seg}`);
  }

  return normalized;
}

/* --------------------------------
   Load vault segment
-------------------------------- */

export async function loadVaultSegment(lane, segment = "segment1") {
  const L = normLane(lane);
  const S = await normSegment(L, segment);

  const metaUrl = `/vault/${L}/${S}/segment.meta.json`;
  const sessUrl = `/vault/${L}/${S}/sessions.json`;

  const [meta, data] = await Promise.all([
    fetchJson(metaUrl),
    fetchJson(sessUrl)
  ]);

  const sessions = Array.isArray(data)
    ? data
    : (Array.isArray(data?.sessions) ? data.sessions : []);

  return {
    lane: L,
    segment: S,
    meta,
    sessions
  };
}

/* --------------------------------
   Get a specific session
-------------------------------- */

export async function getVaultSession(lane, segment, sessionNumber) {
  const n = Number(sessionNumber);

  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`Bad session number: ${sessionNumber}`);
  }

  const { meta, sessions } = await loadVaultSegment(lane, segment);

  const s = sessions.find(x => Number(x?.n) === n) || null;

  if (!s) {
    throw new Error(`Session ${n} not found in vault.`);
  }

  return { meta, session: s };
}

/* --------------------------------
   System status
-------------------------------- */

export async function getSystemStatus() {
  return await fetchJson("/vault/system-status.json");
}

/* --------------------------------
   Helpers: strength source resolution
-------------------------------- */

function normPhase(phase) {
  const raw = String(phase || "").trim().toLowerCase();

  const aliases = {
    "pre-season": "preseason",
    "preseason": "preseason",
    "in-season": "inseason",
    "inseason": "inseason",
    "post-season": "postseason",
    "postseason": "postseason"
  };

  return aliases[raw] || raw;
}

function normRotation(rotation) {
  return String(rotation || "").trim().toUpperCase();
}

function normSource(source) {
  return String(source || "").trim().toLowerCase();
}

/*
  IMPORTANT:
  Change this path builder only if your real source files live elsewhere.
*/
function buildSourceUrl(source) {
  const src = normSource(source);
  return `/vault/strength/sources/${src}.json`;
}

async function loadSourceLibrary(source) {
  const src = normSource(source);

  if (!src) {
    throw new Error("Missing session source.");
  }

  if (sourceCache[src]) {
    return sourceCache[src];
  }

  const url = buildSourceUrl(src);
  const data = await fetchJson(url);

  /*
    Support either:
    - array of objects
    - { workouts: [...] }
    - { items: [...] }
  */
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.workouts)
      ? data.workouts
      : Array.isArray(data?.items)
        ? data.items
        : [];

  sourceCache[src] = items;
  return items;
}

function getStrengthWorkoutId(source, rotation) {
  const src = normSource(source).toUpperCase().replace(/-/g, "_");
  const rot = normRotation(rotation);

  if (!src) throw new Error("Cannot build workout id without source.");
  if (!rot) throw new Error("Cannot build workout id without rotation.");

  return `${src}_${rot}`;
}

function resolveSeasonBlock(workoutDef, phase) {
  const p = normPhase(phase);
  return workoutDef?.seasonBlocks?.[p] || null;
}

async function resolveStrengthSession(session, laneStatus, meta) {
  const source = normSource(session?.source);
  if (!source) return session;

  const rotation = normRotation(laneStatus?.rotation);
  const seasonPhase = normPhase(
    laneStatus?.seasonPhase ||
    meta?.phase ||
    "postseason"
  );

  /*
    Only resolve rotation-aware iron sessions here.
    Other strength types can still pass through for now.
  */
  if (source !== "iron") {
    return {
      ...session,
      resolved: {
        kind: source,
        seasonPhase,
        rotation: rotation || null
      }
    };
  }

  if (!rotation) {
    throw new Error(`Missing rotation for strength source "${source}".`);
  }

  const library = await loadSourceLibrary(source);
  const workoutId = getStrengthWorkoutId(source, rotation);

  const workoutDef =
    library.find(x => String(x?.id || "").trim() === workoutId) || null;

  if (!workoutDef) {
    throw new Error(`Workout definition not found: ${workoutId}`);
  }

  const seasonBlock = resolveSeasonBlock(workoutDef, seasonPhase);

  if (!seasonBlock) {
    throw new Error(
      `Season block "${seasonPhase}" not found in workout ${workoutId}`
    );
  }

  return {
    ...session,
    resolved: {
      kind: "iron",
      source,
      workoutId,
      rotation,
      seasonPhase,
      workout: workoutDef,
      seasonBlock,
      sessionStructure: workoutDef?.sessionStructure || [],
      explosivePool: workoutDef?.explosivePool || [],
      loggingRule: workoutDef?.loggingRule || null,
      intensityRule: workoutDef?.intensityRule || null,
      coachNote: workoutDef?.coachNote || session?.coachNote || "",
      tagline: workoutDef?.tagline || ""
    }
  };
}

/* --------------------------------
   Helpers: athlete session progress
-------------------------------- */

function toNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function isApprovedLog(x) {
  const status = String(x?.status || "").trim().toLowerCase();
  return status === "approved";
}

function getLogSessionNumber(x) {
  return toNum(
    x?.sessionNumber ??
    x?.sessionN ??
    x?.n,
    0
  );
}

function getHighestApprovedSessionNumber(athleteLogs = []) {
  const approved = athleteLogs.filter(isApprovedLog);
  if (!approved.length) return 0;

  return Math.max(...approved.map(getLogSessionNumber));
}

function getNextSessionNumberFromLogs(athleteLogs = [], sessions = []) {
  const highestApproved = getHighestApprovedSessionNumber(athleteLogs);

  // no approved sessions yet -> session 1
  if (highestApproved <= 0) return 1;

  const maxSession = Array.isArray(sessions) && sessions.length
    ? Math.max(...sessions.map(x => toNum(x?.n, 0)))
    : 1;

  return Math.min(highestApproved + 1, maxSession);
}

/* --------------------------------
   Active vault session (GLOBAL)
   Keep for admin/global preview use
-------------------------------- */

export async function getActiveVaultSession(lane) {
  const L = normLane(lane);

  const status = await getSystemStatus();
  const laneStatus = status?.[L];

  if (!laneStatus) {
    throw new Error(`Missing system status for lane: ${L}`);
  }

  const segment = await normSegment(
    L,
    laneStatus.activeSegment || "segment1"
  );

  const { meta, sessions } = await loadVaultSegment(L, segment);

  let session = null;

  if (laneStatus.activeSessionId) {
    session = sessions.find(
      x => String(x?.id || "").trim() === laneStatus.activeSessionId
    ) || null;

    if (!session) {
      throw new Error(
        `Active session id not found: ${laneStatus.activeSessionId}`
      );
    }
  } else {
    const n = Number(laneStatus.activeSessionN || 1);

    session = sessions.find(x => Number(x?.n) === n) || null;

    if (!session) {
      throw new Error(`Active session number not found: ${n}`);
    }
  }

  if (L === "strength") {
    session = await resolveStrengthSession(session, laneStatus, meta);
  }

  return {
    meta,
    session,
    lane: L,
    segment,
    status: laneStatus
  };
}

/* --------------------------------
   Athlete vault session (PER ATHLETE)
   Use this on athlete profile pages
-------------------------------- */

export async function getAthleteVaultSession(
  lane,
  athleteLogs = [],
  segment = "segment1",
  options = {}
) {
  const L = normLane(lane);
  const S = await normSegment(L, segment);
  const { meta, sessions } = await loadVaultSegment(L, S);

  if (!Array.isArray(sessions) || !sessions.length) {
    throw new Error(`No sessions found for ${L}/${S}`);
  }

  const nextSessionNumber = getNextSessionNumberFromLogs(athleteLogs, sessions);

  let session =
    sessions.find(x => Number(x?.n) === nextSessionNumber) || null;

  if (!session) {
    throw new Error(
      `Session ${nextSessionNumber} not found for ${L}/${S}`
    );
  }

  /*
    Strength session resolution still needs rotation/phase context.
    On athlete pages, pass options like:
    {
      rotation: "A",
      seasonPhase: "postseason"
    }
  */
  if (L === "strength") {
    session = await resolveStrengthSession(
      session,
      {
        rotation: options?.rotation || null,
        seasonPhase: options?.seasonPhase || meta?.phase || "postseason"
      },
      meta
    );
  }

  return {
    meta,
    session,
    lane: L,
    segment: S,
    currentSession: nextSessionNumber,
    highestApprovedSession: getHighestApprovedSessionNumber(athleteLogs)
  };
}