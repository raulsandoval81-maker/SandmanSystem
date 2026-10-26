/**
 * Sandman practice execution contract — pure, browser + Node compatible.
 * Clipboard owns the plan; Big Clock and Audio Only will consume this same timeline.
 * No Firebase writes, UI state, or progression decisions in this module.
 */
export const EXECUTION_CONTRACT_VERSION = 1;
export const INNER_DRILL_CONTRACT_VERSION = "sandman-inner-drill-v1";

const positive = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const whole = (value, fallback = 0) => Math.floor(positive(value, fallback));
const text = value => String(value ?? "").trim();
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function normalizeInnerDrill(drill, drillIndex) {
  const source = drill?.innerDrill;
  const legacySeconds = Math.round(positive(drill?.minutes) * 60);
  const base = {
    id: text(drill?.id) || `drill-${drillIndex + 1}`,
    name: text(drill?.name) || `Drill ${drillIndex + 1}`,
    seconds: legacySeconds,
    reservedSeconds: legacySeconds,
    coachingCues: text(drill?.coachingCues),
    flowCues: text(drill?.flowCues),
    goal: text(drill?.goal),
    cueLevel: text(drill?.cueLevel) || "optimal",
    innerDrill: null,
    phases: [],
    assignedGroupIds: [],
    error: null
  };
  if (!source) return base;
  if (source.contractVersion !== INNER_DRILL_CONTRACT_VERSION) {
    return { ...base, error: "UNSUPPORTED_INNER_DRILL_CONTRACT" };
  }
  if (!["manual", "hybrid", "auto"].includes(source.practiceMode)
      || !["coach", "server-suggestion"].includes(source.origin)) {
    return { ...base, error: "UNSUPPORTED_INNER_DRILL_AUTHORITY" };
  }
  if (source.practiceMode === "auto" || source.origin === "server-suggestion") {
    return { ...base, error: "AUTO_PREVIEW_NOT_EXECUTABLE" };
  }
  if (!Array.isArray(source.phases) || !source.phases.length) {
    return { ...base, error: "INVALID_INNER_DRILL_PHASES" };
  }
  if (!["drill", "live", "match"].includes(source.kind)
      || source.planningOnly !== true || source.authoritative !== false
      || source.eligibleForAuto !== false) {
    return { ...base, error: "UNSUPPORTED_INNER_DRILL_FORMAT" };
  }
  const phases = [];
  const phaseIds = new Set();
  for (const [phaseIndex, item] of source.phases.entries()) {
    const rawSeconds = Number(item?.seconds);
    const seconds = whole(rawSeconds);
    const kind = text(item?.kind).toLowerCase();
    const id = text(item?.id) || `phase-${phaseIndex + 1}`;
    if (!Number.isInteger(rawSeconds) || !seconds || phaseIds.has(id)
        || !["work", "rest", "break"].includes(kind)) {
      return { ...base, error: "UNSUPPORTED_INNER_DRILL_PHASE" };
    }
    phaseIds.add(id);
    const shortTimeCueSeconds = item?.shortTimeCueSeconds == null ? 0 : Number(item.shortTimeCueSeconds);
    if (!Number.isInteger(shortTimeCueSeconds) || shortTimeCueSeconds < 0 || shortTimeCueSeconds >= seconds) {
      return { ...base, error: "UNSUPPORTED_INNER_DRILL_PHASE" };
    }
    phases.push({
      id,
      label: text(item?.label) || base.name,
      kind,
      seconds,
      round: whole(item?.round),
      rounds: whole(item?.rounds),
      match: whole(item?.match),
      matches: whole(item?.matches),
      shortTimeCueSeconds,
      rotation: item?.rotation ? clone(item.rotation) : null
    });
  }
  const exactSeconds = phases.reduce((sum, item) => sum + item.seconds, 0);
  const declaredSeconds = Number(source.scheduledSeconds);
  const reservedMinutes = Number(source.reservedMinutes || drill?.minutes);
  if (!Number.isInteger(declaredSeconds) || !Number.isInteger(reservedMinutes)) {
    return { ...base, error: "INNER_DRILL_DURATION_MISMATCH" };
  }
  if (declaredSeconds !== exactSeconds) return { ...base, error: "INNER_DRILL_DURATION_MISMATCH" };
  if (reservedMinutes !== Math.ceil(exactSeconds / 60)
      || Number(drill?.minutes) !== reservedMinutes) {
    return { ...base, error: "INNER_DRILL_RESERVATION_MISMATCH" };
  }
  return {
    ...base,
    seconds: exactSeconds,
    reservedSeconds: reservedMinutes * 60,
    innerDrill: {
      contractVersion: source.contractVersion,
      kind: text(source.kind),
      discipline: text(source.discipline),
      practiceMode: text(source.practiceMode),
      origin: text(source.origin),
      skillFamily: text(source.skillFamily),
      coachCard: source.coachCard ? clone(source.coachCard) : null,
      recommendationProvenance: clone(source.recommendationProvenance || null),
      skillProvenance: clone(source.skillProvenance || null)
    },
    phases,
    assignedGroupIds: [...new Set((source.assignedGroupIds || []).map(text).filter(Boolean))]
  };
}

/**
 * Interpret a Clipboard block. An explicit interval specification takes priority.
 * Legacy {pack,preset,label} is retained as display metadata, not interpreted as
 * executable timing unless it has an explicit supported rounds/workSeconds shape.
 */
export function normalizePracticeBlock(block, index = 0) {
  const minutes = positive(block?.minutes);
  const blockSeconds = Math.round(minutes * 60);
  const sourceTimer = block?.timer || {};
  const interval = sourceTimer?.execution || {};
  const rounds = whole(interval.rounds ?? sourceTimer.rounds);
  const workSeconds = whole(interval.workSeconds ?? sourceTimer.workSeconds);
  const restSeconds = whole(interval.restSeconds ?? sourceTimer.restSeconds);
  const warningSeconds = whole(interval.warningSeconds ?? sourceTimer.warningSeconds);
  const hasIntervals = rounds > 0 && workSeconds > 0;
  const linkedSkillIds = Array.isArray(interval.linkedSkillIds ?? sourceTimer.linkedSkillIds)
    ? [...new Set((interval.linkedSkillIds ?? sourceTimer.linkedSkillIds).map(text).filter(Boolean))]
    : [];
  const drills = Array.isArray(block?.drillBlocks)
    ? block.drillBlocks.map(normalizeInnerDrill).filter(drill => drill.seconds > 0 || drill.error)
    : [];
  return {
    id: text(block?.slot) || `block-${index + 1}`,
    title: text(block?.title) || `Block ${index + 1}`,
    seconds: blockSeconds,
    timer: {
      pack: text(sourceTimer.pack),
      preset: text(sourceTimer.preset),
      label: text(sourceTimer.label),
      execution: hasIntervals ? { rounds, workSeconds, restSeconds, warningSeconds, linkedSkillIds } : null
    },
    drills,
    cards: Array.isArray(block?.cards) ? block.cards : [],
    groupActivities: Array.isArray(block?.groupActivities) ? block.groupActivities : []
  };
}

/**
 * Derive a deterministic timeline. Parent block allocation is the upper limit:
 * overfull interval/drill plans report errors instead of silently truncating.
 * A gap remains unallocated rather than creating invented instruction.
 */
export function compilePracticeTimeline(plan) {
  const blocks = (Array.isArray(plan?.blocks) ? plan.blocks : [])
    .map(normalizePracticeBlock).filter(block => block.seconds > 0);
  const errors = [];
  const events = [];
  let offset = 0;
  for (const block of blocks) {
    const blockStart = offset;
    events.push({ type: "block-start", atSeconds: offset, blockId: block.id, label: block.title });
    const rule = block.timer.execution;
    let subSeconds = 0;
    let reservedSeconds = 0;
    let hasInnerDrills = false;
    const drillError = block.drills.find(drill => drill.error);
    if (drillError) {
      errors.push({ blockId: block.id, drillId: drillError.id, code: drillError.error });
      offset += block.seconds;
      events.push({ type: "block-end", atSeconds: offset, blockId: block.id });
      continue;
    }
    if (rule && block.drills.length) {
      errors.push({ blockId: block.id, code: "CONFLICTING_TIMER_AND_DRILLS" });
      offset += block.seconds;
      events.push({ type: "block-end", atSeconds: offset, blockId: block.id });
      continue;
    }
    if (rule) {
      for (let round = 1; round <= rule.rounds; round++) {
        const begin = blockStart + subSeconds;
        events.push({ type: "round-start", atSeconds: begin, blockId: block.id, round, label: block.timer.label || block.title });
        if (rule.warningSeconds > 0 && rule.warningSeconds < rule.workSeconds) {
          events.push({ type: "warning", atSeconds: begin + rule.workSeconds - rule.warningSeconds, blockId: block.id, round, secondsRemaining: rule.warningSeconds });
        }
        subSeconds += rule.workSeconds;
        events.push({ type: "round-end", atSeconds: blockStart + subSeconds, blockId: block.id, round });
        if (round < rule.rounds && rule.restSeconds) {
          events.push({ type: "rest-start", atSeconds: blockStart + subSeconds, blockId: block.id, round, durationSeconds: rule.restSeconds });
          subSeconds += rule.restSeconds;
        }
      }
    } else if (block.drills.length) {
      reservedSeconds = block.drills.reduce((sum, drill) => sum + drill.reservedSeconds, 0);
      hasInnerDrills = block.drills.some(drill => drill.innerDrill);
      for (const drill of block.drills) {
        events.push({ type: "drill-start", atSeconds: blockStart + subSeconds, blockId: block.id, drillId: drill.id, label: drill.name, coachingCues: drill.coachingCues, flowCues: drill.flowCues });
        if (drill.phases.length) {
          for (const item of drill.phases) {
            const phaseStart = blockStart + subSeconds;
            events.push({ type: "inner-phase-start", atSeconds: phaseStart, blockId: block.id,
              drillId: drill.id, phaseId: item.id, kind: item.kind, label: item.label,
              round: item.round, rounds: item.rounds, rotation: clone(item.rotation) });
            if (item.shortTimeCueSeconds > 0 && item.shortTimeCueSeconds < item.seconds) {
              events.push({ type: "short-time", atSeconds: phaseStart + item.seconds - item.shortTimeCueSeconds,
                blockId: block.id, drillId: drill.id, phaseId: item.id,
                secondsRemaining: item.shortTimeCueSeconds });
            }
            subSeconds += item.seconds;
          }
        } else {
          subSeconds += drill.seconds;
        }
      }
    }
    if (subSeconds > block.seconds) {
      errors.push({ blockId: block.id, code: "OVER_ALLOCATED", allocatedSeconds: block.seconds, requestedSeconds: subSeconds });
    } else if (hasInnerDrills && reservedSeconds > block.seconds) {
      errors.push({ blockId: block.id, code: "INNER_DRILL_RESERVATION_OVER_ALLOCATED",
        allocatedSeconds: block.seconds, requestedSeconds: reservedSeconds });
    }
    offset += block.seconds;
    events.push({ type: "block-end", atSeconds: offset, blockId: block.id });
  }
  const expectedSeconds = plan?.durationMinutes == null ? null : Math.round(positive(plan.durationMinutes) * 60);
  if (expectedSeconds !== null && expectedSeconds !== offset) {
    errors.push({ code: "PRACTICE_DURATION_MISMATCH", allocatedSeconds: expectedSeconds, requestedSeconds: offset });
  }
  // Invalid timelines must not supply executable events past their parent boundaries.
  if (errors.length) return { version: EXECUTION_CONTRACT_VERSION, totalSeconds: offset, blocks, events: [], errors, valid: false };
  events.sort((a,b) => a.atSeconds - b.atSeconds);
  return { version: EXECUTION_CONTRACT_VERSION, totalSeconds: offset, blocks, events, errors, valid: errors.length === 0 };
}

/** Resolve nested drill/phase presentation from the parent block's authoritative elapsed time. */
export function getActiveInnerDrill(block, elapsedSeconds = 0) {
  const drills = Array.isArray(block?.drills) ? block.drills : [];
  const elapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  let drillCursor = 0;
  for (const [drillIndex, drill] of drills.entries()) {
    const drillEnd = drillCursor + drill.seconds;
    if (elapsed < drillEnd) {
      if (!drill.phases.length) return {
        drill, next: drills[drillIndex + 1] || null, phase: null,
        drillRemainingSeconds: drillEnd - elapsed,
        phaseRemainingSeconds: drillEnd - elapsed,
        phaseEndsAtSeconds: drillEnd
      };
      let phaseCursor = drillCursor;
      for (const [phaseIndex, item] of drill.phases.entries()) {
        const phaseEnd = phaseCursor + item.seconds;
        if (elapsed < phaseEnd) return {
          drill, next: drills[drillIndex + 1] || null, phase: item,
          phaseIndex, phaseCount: drill.phases.length,
          drillRemainingSeconds: drillEnd - elapsed,
          phaseRemainingSeconds: phaseEnd - elapsed,
          phaseEndsAtSeconds: phaseEnd,
          shortTimeActive: item.shortTimeCueSeconds > 0
            && phaseEnd - elapsed <= item.shortTimeCueSeconds
        };
        phaseCursor = phaseEnd;
      }
    }
    drillCursor = drillEnd;
  }
  return null;
}

/** The existing block clock is the only time authority, including while paused. */
export function getRunElapsedSeconds(state = {}, nowMs = Date.now()) {
  if (state.paused) return Math.max(0, whole(state.blockElapsedSeconds));
  if (!state.blockStartedAt) return Math.max(0, whole(state.blockElapsedSeconds));
  return Math.max(0, Math.floor((Number(nowMs) - Number(state.blockStartedAt)) / 1000));
}

export function pauseRunClock(state = {}, nowMs = Date.now()) {
  if (!state.running || state.paused) return state;
  return { ...state, running: false, paused: true,
    blockElapsedSeconds: getRunElapsedSeconds(state, nowMs), updatedAt: Number(nowMs) };
}

export function resumeRunClock(state = {}, nowMs = Date.now()) {
  if (!state.paused || state.complete) return state;
  const elapsed = Math.max(0, whole(state.blockElapsedSeconds));
  return { ...state, running: true, paused: false,
    blockStartedAt: Number(nowMs) - elapsed * 1000, updatedAt: Number(nowMs) };
}

export function seekRunClock(state = {}, elapsedSeconds = 0, nowMs = Date.now()) {
  const elapsed = Math.max(0, whole(elapsedSeconds));
  return { ...state, blockElapsedSeconds: elapsed,
    blockStartedAt: Number(nowMs) - elapsed * 1000, updatedAt: Number(nowMs) };
}

/** Mode affects presentation, never the compiled timing instructions. */
export function normalizeExecutionMode(mode) {
  return mode === "audio-only" ? "audio-only" : "big-clock";
}

/** Sound settings are user choices; speaking is not triggered by compilation. */
export function normalizeAudioSettings(input = {}) {
  const mode = ["silent", "beeps", "voice"].includes(input.mode) ? input.mode : "beeps";
  return {
    mode,
    announceSkills: input.announceSkills !== false,
    announceTransitions: input.announceTransitions !== false,
    announceWarnings: input.announceWarnings !== false
  };
}

/**
 * Resolve the currently active interval for a compiled parent block.
 * Returns null for legacy timing, preserving existing Big Clock behavior.
 * Elapsed is measured from parent-block start. The parent block remains
 * authoritative; the remainder of a partially occupied block is unassigned.
 */
export function getActiveCombatInterval(block, elapsedSeconds = 0) {
  const rule = block?.timer?.execution;
  if (!rule || !(rule.rounds > 0 && rule.workSeconds > 0)) return null;
  const elapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  let cursor = 0;
  for (let round = 1; round <= rule.rounds; round++) {
    const workEnd = cursor + rule.workSeconds;
    if (elapsed < workEnd) {
      return { phase: "work", round, rounds: rule.rounds,
        remainingSeconds: workEnd - elapsed, label: block.timer.label || block.title || "",
        linkedSkillIds: rule.linkedSkillIds || [] };
    }
    cursor = workEnd;
    if (round < rule.rounds && rule.restSeconds > 0) {
      const restEnd = cursor + rule.restSeconds;
      if (elapsed < restEnd) return { phase: "rest", round, rounds: rule.rounds,
        remainingSeconds: restEnd - elapsed, label: "Rest", linkedSkillIds: [] };
      cursor = restEnd;
    }
  }
  return { phase: "complete", round: rule.rounds, rounds: rule.rounds,
    remainingSeconds: 0, label: "", linkedSkillIds: [] };
}
