export const EXECUTION_CONTROL_VERSION = "sandman-execution-control-v1";
export const EXECUTION_COMMAND_TYPES = new Set([
  "start", "pause", "resume", "skip", "advance", "end", "adjust-current-time",
  "switch-drill", "switch-group", "substitute-drill", "adjust-future-block"
]);

const text = value => String(value ?? "").trim();
const seconds = value => Math.max(0, Math.floor(Number(value) || 0));

export function buildExecutionCommand({ commandId, practiceId, sessionId, planVersion, type,
  blockId = "", drillId = "", groupId = "", seconds: duration = 0, replacementDrillId = "" }) {
  const normalizedType = text(type).toLowerCase();
  if (!text(commandId) || !text(practiceId) || !text(sessionId) || !Number.isInteger(Number(planVersion))
    || Number(planVersion) < 1 || !EXECUTION_COMMAND_TYPES.has(normalizedType)) {
    throw new Error("INVALID_EXECUTION_COMMAND");
  }
  return {
    contractVersion: EXECUTION_CONTROL_VERSION, commandId: text(commandId), practiceId: text(practiceId),
    sessionId: text(sessionId), planVersion: Number(planVersion), type: normalizedType,
    blockId: text(blockId), drillId: text(drillId), groupId: text(groupId),
    seconds: seconds(duration), replacementDrillId: text(replacementDrillId)
  };
}

export function controllerSnapshot(state, { sessionId, blockId = "", drillId = "", groupId = "", now = Date.now() } = {}) {
  const elapsed = state?.running && !state?.paused
    ? seconds(state.blockElapsedSeconds) + seconds((now - Number(state.blockStartedAt || now)) / 1000)
    : seconds(state?.blockElapsedSeconds);
  const duration = seconds(state?.blockDuration);
  return {
    contractVersion: EXECUTION_CONTROL_VERSION, sessionId: text(sessionId),
    running: state?.running === true, paused: state?.paused === true, complete: state?.complete === true,
    index: Math.max(0, Math.floor(Number(state?.index) || 0)), blockId: text(blockId),
    drillId: text(drillId), groupId: text(groupId), elapsedSeconds: Math.min(duration, elapsed),
    remainingSeconds: Math.max(0, duration - elapsed)
  };
}

/** Apply a server-accepted command to the existing Big Clock state; it never advances time itself. */
export function applyExecutionCommand(state, command, { now = Date.now(), phaseEndSeconds = 0, blockCount = 0 } = {}) {
  if (!EXECUTION_COMMAND_TYPES.has(text(command?.type))) throw new Error("UNSUPPORTED_EXECUTION_COMMAND");
  const currentElapsed = seconds(state?.blockElapsedSeconds)
    + (state?.running && !state?.paused ? seconds((now - Number(state.blockStartedAt || now)) / 1000) : 0);
  switch (command.type) {
    case "start": return { ...state, running: true, paused: false, complete: false, blockStartedAt: now };
    case "pause": return { ...state, running: false, paused: true, blockElapsedSeconds: currentElapsed, blockStartedAt: null };
    case "resume": return { ...state, running: true, paused: false, blockStartedAt: now };
    case "skip": return { ...state, blockElapsedSeconds: Math.max(currentElapsed, seconds(phaseEndSeconds)), blockStartedAt: now };
    case "advance": {
      const next = Math.min(Math.max(0, blockCount - 1), seconds(state?.index) + 1);
      return { ...state, index: next, blockElapsedSeconds: 0, blockStartedAt: now };
    }
    case "end": return { ...state, running: false, paused: false, complete: true,
      blockElapsedSeconds: currentElapsed, blockStartedAt: null };
    case "adjust-current-time": return { ...state, blockDuration: seconds(command.seconds) };
    case "switch-drill":
    case "switch-group":
    case "substitute-drill": return { ...state, activeDrillId: text(command.drillId || command.replacementDrillId), activeGroupId: text(command.groupId) || text(state?.activeGroupId) };
    case "adjust-future-block": return { ...state, remoteFutureAdjustments: {
      ...(state?.remoteFutureAdjustments || {}), [text(command.blockId)]: seconds(command.seconds)
    } };
  }
}
