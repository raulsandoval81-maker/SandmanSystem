/**
 * Sandman practice execution contract — pure, browser + Node compatible.
 * Clipboard owns the plan; Big Clock and Audio Only will consume this same timeline.
 * No Firebase writes, UI state, or progression decisions in this module.
 */
export const EXECUTION_CONTRACT_VERSION = 1;

const positive = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const whole = (value, fallback = 0) => Math.floor(positive(value, fallback));
const text = value => String(value ?? "").trim();

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
    ? block.drillBlocks.map((drill, drillIndex) => ({
        id: text(drill?.id) || `drill-${drillIndex + 1}`,
        name: text(drill?.name) || `Drill ${drillIndex + 1}`,
        seconds: Math.round(positive(drill?.minutes) * 60),
        coachingCues: text(drill?.coachingCues),
        flowCues: text(drill?.flowCues),
      })).filter(drill => drill.seconds > 0)
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
      for (const drill of block.drills) {
        events.push({ type: "drill-start", atSeconds: blockStart + subSeconds, blockId: block.id, drillId: drill.id, label: drill.name, coachingCues: drill.coachingCues, flowCues: drill.flowCues });
        subSeconds += drill.seconds;
      }
    }
    if (subSeconds > block.seconds) {
      errors.push({ blockId: block.id, code: "OVER_ALLOCATED", allocatedSeconds: block.seconds, requestedSeconds: subSeconds });
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
