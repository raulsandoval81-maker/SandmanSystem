/**
 * Checkpoint 7 execution evidence contract.
 *
 * Big Clock supplies observable controller facts. Coach Companion may turn those
 * facts into a draft and explicitly verify them. Nothing in this module awards
 * XP, attendance, mastery, or progression.
 */
export const EXECUTION_ACTUALS_VERSION = "sandman-execution-actuals-v1";
export const OBSERVATION_ACTIONS = new Set([
  "start", "pause", "resume", "skip", "advance", "complete", "early-complete",
  "phase-complete", "drill-complete"
]);
export const COACH_OUTCOMES = new Set(["completed", "modified", "skipped", "not-observed"]);

const text = value => String(value ?? "").trim();
const seconds = value => Math.max(0, Math.floor(Number(value) || 0));

export function executionObservation({ practiceId, sessionId, planVersion, action, block, active, elapsedSeconds, eventId }) {
  const normalizedAction = text(action).toLowerCase();
  if (!text(practiceId) || !text(sessionId) || !Number.isInteger(Number(planVersion)) || Number(planVersion) < 1) {
    throw new Error("MISSING_EXECUTION_IDENTITY");
  }
  if (!OBSERVATION_ACTIONS.has(normalizedAction)) throw new Error("UNSUPPORTED_EXECUTION_ACTION");
  const blockId = text(block?.id || block?.slot || block?.blockId || block?.title);
  if (!blockId) throw new Error("MISSING_EXECUTION_BLOCK");
  const drillId = text(active?.drill?.id);
  const phaseId = text(active?.phase?.id);
  return {
    contractVersion: EXECUTION_ACTUALS_VERSION,
    eventId: text(eventId) || [text(sessionId), normalizedAction, blockId, drillId || "block", phaseId || "phase", seconds(elapsedSeconds)].join(":"),
    practiceId: text(practiceId),
    sessionId: text(sessionId),
    planVersion: Number(planVersion),
    action: normalizedAction,
    blockId,
    drillId,
    phaseId,
    phaseKind: text(active?.phase?.kind),
    elapsedSeconds: seconds(elapsedSeconds),
    phaseElapsedSeconds: active?.phase ? Math.max(0, seconds(active.phase.seconds) - seconds(active.phaseRemainingSeconds)) : 0,
    observedOnly: true,
    athleteIds: []
  };
}

export function resolveNextPlanVersion(savedVersion) {
  const current = Number(savedVersion);
  return Number.isInteger(current) && current > 0 ? current + 1 : 1;
}

/** Return deterministic milestones crossed by the existing parent-block clock. */
export function completedExecutionMilestones(block, elapsedSeconds = 0) {
  const elapsed = seconds(elapsedSeconds);
  const milestones = [];
  let cursor = 0;
  for (const drill of Array.isArray(block?.drills) ? block.drills : []) {
    let phaseCursor = cursor;
    for (const phase of Array.isArray(drill?.phases) ? drill.phases : []) {
      phaseCursor += seconds(phase.seconds);
      if (phaseCursor <= elapsed) milestones.push({
        action: "phase-complete", elapsedSeconds: phaseCursor,
        active: { drill, phase, phaseRemainingSeconds: 0 }
      });
    }
    const drillSeconds = seconds(drill?.seconds)
      || (Array.isArray(drill?.phases) ? drill.phases.reduce((sum, phase) => sum + seconds(phase.seconds), 0) : 0);
    cursor += drillSeconds;
    if (drillSeconds > 0 && cursor <= elapsed) milestones.push({
      action: "drill-complete", elapsedSeconds: cursor,
      active: { drill, phase: null, phaseRemainingSeconds: 0 }
    });
  }
  return milestones;
}

/** Serial, retryable persistence keeps rapid controller events ordered. */
export function createObservationQueue({ persist, onChange = () => {}, initial = [] } = {}) {
  if (typeof persist !== "function") throw new Error("OBSERVATION_PERSIST_REQUIRED");
  const pending = [...initial];
  const known = new Set(pending.map(item => item.eventId));
  let draining = false;
  let lastError = null;
  const snapshot = () => ({ pending: [...pending], draining, lastError });
  const notify = () => onChange(snapshot());
  const drain = async () => {
    if (draining) return;
    draining = true; lastError = null; notify();
    while (pending.length) {
      try {
        await persist(pending[0]);
        pending.shift();
        notify();
      } catch (error) {
        lastError = error;
        break;
      }
    }
    draining = false; notify();
  };
  return {
    enqueue(item) {
      if (!item?.eventId || known.has(item.eventId)) return false;
      known.add(item.eventId); pending.push(item); notify(); void drain(); return true;
    },
    retry() { void drain(); },
    snapshot
  };
}

/** Derive a concise review without claiming athlete participation. */
export function summarizeObservedExecution(planBlocks = [], events = []) {
  const ordered = [...events].sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
  return planBlocks.flatMap(block => {
    const drills = Array.isArray(block?.drills) ? block.drills : [];
    const targets = drills.length ? drills : [{ id: "", name: block.title || block.blockId, phases: [] }];
    return targets.map(drill => {
      const relevant = ordered.filter(event => event.blockId === block.blockId
        && (!drill.id || event.drillId === drill.id));
      const skippedPhaseIds = [...new Set(relevant
        .filter(event => event.action === "skip" && event.phaseId).map(event => text(event.phaseId)))];
      const skipped = relevant.some(event => event.action === "skip" && !event.phaseId);
      const completed = drill.id
        ? relevant.some(event => event.action === "drill-complete")
        : relevant.some(event => ["advance", "complete"].includes(event.action));
      const elapsedSeconds = relevant.reduce((max, event) => Math.max(max, seconds(event.elapsedSeconds)), 0);
      return {
        blockId: text(block.blockId), drillId: text(drill.id), name: text(drill.name || block.title),
        status: skipped ? "skipped" : skippedPhaseIds.length ? "partial"
          : completed ? "completed" : relevant.length ? "partial" : "not-observed",
        skippedPhaseIds, elapsedSeconds, observedOnly: true, athleteIds: []
      };
    });
  });
}

export function normalizeCoachActual(entry = {}) {
  const outcome = text(entry.outcome).toLowerCase();
  if (!COACH_OUTCOMES.has(outcome)) throw new Error("UNSUPPORTED_COACH_OUTCOME");
  return {
    blockId: text(entry.blockId), drillId: text(entry.drillId), phaseId: text(entry.phaseId),
    outcome, executedSeconds: seconds(entry.executedSeconds),
    groupIds: [...new Set((entry.groupIds || []).map(text).filter(Boolean))],
    athleteIds: [...new Set((entry.athleteIds || []).map(text).filter(Boolean))],
    note: text(entry.note).slice(0, 500)
  };
}

export function buildActualsSubmission({ practiceId, planVersion, entries, verificationId }) {
  return {
    contractVersion: EXECUTION_ACTUALS_VERSION,
    practiceId: text(practiceId),
    planVersion: Number(planVersion),
    verificationId: text(verificationId),
    entries: (Array.isArray(entries) ? entries : []).map(normalizeCoachActual),
    coachVerified: false,
    xpEligible: false,
    progressionEligible: false,
    attendanceAuthority: false,
    closeoutFinalized: false
  };
}
