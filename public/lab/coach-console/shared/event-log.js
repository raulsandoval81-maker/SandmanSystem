export function formatTime(seconds = 0) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;

  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatRoundLabel(round) {
  const r = String(round || "1");

  return ["1", "2", "3"].includes(r) ? `R${r}` : r;
}

export function formatSide(side) {
  return side === "athlete" ? "GREEN" : "RED";
}

export function sideClass(side) {
  if (side === "athlete") return "green-stamp";
  if (side === "opponent") return "red-stamp";

  return "";
}

export function createScoreEvent({ state, side, code, rule, videoTime = 0 }) {
  return {
    type: "score",

    side,
    code,
    label: rule.label,
    short: rule.short,
    points: rule.points,

    category: rule.category || "unknown",
    phase: rule.phase || state.roundStarts[state.currentRound] || "unknown",

    round: state.currentRound,
    position: state.roundStarts[state.currentRound] || "neutral",

    clock: formatTime(state.time),
    timeRemaining: state.time,
    videoTime,

    createdAt: new Date().toISOString()
  };
}
export function createRefCallEvent({
  state,
  side,
  callType,
  result,
  videoTime = 0
}) {
  return {
    type: "ref_call",

    side,
    callType,
    label: result?.message || callType,
    short: callType.toUpperCase(),

    points: result?.points || 0,
    scoringSide: result?.scoringSide || null,

    category: "official",
    phase: "official",

    round: state.currentRound,
    position: state.roundStarts[state.currentRound] || "neutral",

    clock: formatTime(state.time),
    timeRemaining: state.time,
    videoTime,

    createdAt: new Date().toISOString()
  };
}

export function createRoundStartEvent({
  state,
  round,
  position,
  videoTime = 0
}) {
  const activeRound = round || state?.currentRound || "1";
  const activeTime = typeof state?.time === "number" ? state.time : 0;

  return {
    type: "round_start",
    round: activeRound,
    position: position || state?.roundStarts?.[activeRound] || "neutral",
    clock: formatTime(activeTime),
    timeRemaining: activeTime,
    videoTime,
    createdAt: new Date().toISOString()
  };
}

export function groupEventsByRound(events = []) {
  const grouped = {};

  events.forEach(e => {
    if (!e || !e.round) return;

    if (!grouped[e.round]) grouped[e.round] = [];
    grouped[e.round].push(e);
  });

  return grouped;
}