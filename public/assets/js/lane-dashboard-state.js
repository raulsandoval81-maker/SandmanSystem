import {
  resolveLaneSubmissionIdentity,
  normalizeHonorCategory,
  normalizeStrengthPhase,
} from "./athlete-lane-context.js";
import { resolveLaneRelease } from "./lane-release-schedule.js";

function matchingEntry(submissions, lane, segmentId, sessionN) {
  return Object.entries(submissions || {})
    .map(([key, entry]) => ({ key, entry, identity: resolveLaneSubmissionIdentity({ lane, entry, key }) }))
    .find(({ identity }) => identity.segmentId === segmentId && identity.sessionN === sessionN) || null;
}

export function combatDashboardModel(athlete = {}) {
  const discipline = String(athlete.activeDiscipline || athlete.primaryDiscipline || "").trim().toLowerCase();
  const combat = athlete.disciplines?.[discipline] || athlete;
  const xp = Number(combat.xpCombat ?? combat.xp ?? athlete.xpCombat ?? athlete.xp ?? 0);
  const cap = Number(combat.xpCap ?? combat.cap ?? athlete.xpCap ?? 0);
  return {
    rank: String(combat.rankName || combat.tierName || athlete.rankName || "Current rank"),
    xp: Number.isFinite(xp) ? xp : 0,
    cap: Number.isFinite(cap) ? cap : 0,
  };
}

export function laneDashboardModel({
  lane,
  segmentId,
  sessions,
  submissions,
  athlete = {},
  phase = null,
  category = null,
  now = new Date(),
} = {}) {
  const release = resolveLaneRelease({ lane, segmentId, sessions, submissions, now });
  const sessionN = release.activeSessionN || release.expectedSessionN;
  const current = matchingEntry(submissions, lane, segmentId, sessionN);
  const completedNumbers = Object.entries(submissions || {}).map(([key, entry]) => {
    const identity = resolveLaneSubmissionIdentity({ lane, entry, key });
    const status = String(entry?.status || "").trim().toLowerCase();
    return identity.segmentId === segmentId && ["approved", "closed"].includes(status)
      ? identity.sessionN : null;
  }).filter(Number.isInteger);
  const rawStatus = String(current?.entry?.status || "").trim().toLowerCase();
  let status = release.state;

  if (rawStatus === "needs_revision") status = "revision";
  else if (rawStatus === "pending") status = "pending";
  else if (rawStatus === "approved" || rawStatus === "closed") status = "approved";
  else if (["new", "draft", "incomplete"].includes(rawStatus)) status = "incomplete";
  else if (release.state === "active") status = "active";
  else if (release.state === "content-missing" && Math.max(0, ...completedNumbers) >= 40) status = "approved";

  return {
    lane,
    segmentId,
    missionN: sessionN,
    missionTotal: Number(sessions?.length || 0),
    status,
    nextReleaseAt: release.nextReleaseAt,
    phase: lane === "strength" ? normalizeStrengthPhase(phase) : null,
    category: lane === "honor" ? normalizeHonorCategory(category) : null,
    xp: Number(lane === "strength" ? athlete.xpStrength ?? 0 : athlete.xpHonor ?? 0) || 0,
    release,
  };
}

export function coachLaneRowModel({ athleteId, athlete, strength, honor } = {}) {
  const attention = [strength?.status, honor?.status];
  const action = attention.includes("revision") || attention.includes("pending")
    ? "review"
    : attention.includes("content-missing")
      ? "investigate"
      : attention.includes("incomplete")
        ? "follow-up"
        : "none";
  return {
    athleteId,
    athleteName: String(athlete?.fullName || athlete?.publicName || athlete?.name || athleteId || "Athlete"),
    strength,
    honor,
    action,
  };
}

export function dashboardStatusLabel(status) {
  return ({
    active: "Active",
    incomplete: "Active · incomplete",
    pending: "Pending review",
    revision: "Revision requested",
    approved: "Approved",
    waiting: "Waiting for release",
    "content-missing": "Content unavailable",
    "completion-time-missing": "Review time unavailable",
  })[status] || "Status unavailable";
}
