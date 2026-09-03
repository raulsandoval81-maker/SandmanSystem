import {
  findExactLaneSession,
  getCompletedLaneSubmissionIdentities,
  resolveLaneSubmissionIdentity,
} from "./athlete-lane-context.js";

export const SANDMAN_OPERATIONAL_TIME_ZONE = "America/Los_Angeles";

const RELEASE_DAYS = Object.freeze({
  strength: new Set(["Mon", "Wed", "Fri"]),
  honor: new Set(["Tue", "Thu", "Sat"]),
});

function toDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isFinite(date?.getTime?.()) ? date : null;
  }
  if (Number.isFinite(value?.seconds)) return new Date(value.seconds * 1000);
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function zonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

export function nextLaneReleaseAt(lane, after, {
  timeZone = SANDMAN_OPERATIONAL_TIME_ZONE,
} = {}) {
  const normalizedLane = String(lane || "").trim().toLowerCase();
  const days = RELEASE_DAYS[normalizedLane];
  const afterDate = toDate(after);
  if (!days || !afterDate) return null;

  const hourMs = 60 * 60 * 1000;
  let candidateMs = Math.floor(afterDate.getTime() / hourMs) * hourMs;
  if (candidateMs <= afterDate.getTime()) candidateMs += hourMs;

  for (let step = 0; step <= 8 * 24; step += 1) {
    const candidate = new Date(candidateMs + step * hourMs);
    const parts = zonedParts(candidate, timeZone);
    if (days.has(parts.weekday) && parts.hour === "08" && parts.minute === "00") {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve the next ${normalizedLane} release window.`);
}

function completionTimestamp(entry) {
  return toDate(entry?.closedAt) || toDate(entry?.reviewedAt) || null;
}

export function resolveLaneRelease({
  lane,
  segmentId,
  sessions = [],
  submissions = {},
  now = new Date(),
  timeZone = SANDMAN_OPERATIONAL_TIME_ZONE,
} = {}) {
  const currentTime = toDate(now);
  if (!currentTime) throw new Error("A valid release-resolution time is required.");

  const completed = getCompletedLaneSubmissionIdentities({ submissions, lane, segmentId });
  const highestCompleted = completed[0] || null;
  const nextSessionN = highestCompleted ? highestCompleted.identity.sessionN + 1 : 1;
  const session = findExactLaneSession(sessions, nextSessionN);

  if (!session) {
    return {
      state: "content-missing",
      activeSession: null,
      activeSessionN: null,
      expectedSessionN: nextSessionN,
      nextEligible: false,
      nextReleaseAt: null,
      blockedByIncomplete: false,
      waitingForRelease: false,
    };
  }

  const openEntry = Object.entries(submissions)
    .map(([key, entry]) => ({
      entry,
      identity: resolveLaneSubmissionIdentity({ lane, entry, key }),
    }))
    .find(({ entry, identity }) => {
      const status = String(entry?.status || "").trim().toLowerCase();
      return identity.segmentId === segmentId &&
        identity.sessionN === nextSessionN &&
        !["approved", "closed"].includes(status);
    });

  if (!highestCompleted) {
    return {
      state: "active",
      activeSession: session,
      activeSessionN: nextSessionN,
      expectedSessionN: nextSessionN,
      nextEligible: true,
      nextReleaseAt: null,
      blockedByIncomplete: Boolean(openEntry),
      waitingForRelease: false,
    };
  }

  const completedAt = completionTimestamp(highestCompleted.entry);
  if (!completedAt) {
    return {
      state: "completion-time-missing",
      activeSession: null,
      activeSessionN: null,
      expectedSessionN: nextSessionN,
      nextEligible: false,
      nextReleaseAt: null,
      blockedByIncomplete: false,
      waitingForRelease: true,
    };
  }

  const releaseAt = nextLaneReleaseAt(lane, completedAt, { timeZone });
  if (openEntry || currentTime >= releaseAt) {
    return {
      state: "active",
      activeSession: session,
      activeSessionN: nextSessionN,
      expectedSessionN: nextSessionN,
      nextEligible: true,
      nextReleaseAt: nextLaneReleaseAt(lane, currentTime, { timeZone }),
      blockedByIncomplete: true,
      waitingForRelease: false,
    };
  }

  return {
    state: "waiting",
    activeSession: null,
    activeSessionN: null,
    expectedSessionN: nextSessionN,
    nextEligible: false,
    nextReleaseAt: releaseAt,
    blockedByIncomplete: false,
    waitingForRelease: true,
  };
}

export function formatLaneReleaseAt(value, {
  timeZone = SANDMAN_OPERATIONAL_TIME_ZONE,
} = {}) {
  const date = toDate(value);
  if (!date) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
