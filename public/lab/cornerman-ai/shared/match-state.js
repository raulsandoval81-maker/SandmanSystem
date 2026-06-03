import { MATCH_FORMATS, DEFAULT_MATCH_FORMAT } from "./match-formats.js";

export const ROUND_KEYS = ["1", "2", "3", "SV1", "TB1", "TB2", "UTB"];

export const ROUND_RULES = {
  "1": { label: "R1", start: "neutral", choice: false },
  "2": { label: "R2", start: null, choice: true },
  "3": { label: "R3", start: null, choice: true },
  "SV1": { label: "SV1", start: "neutral", choice: false },
  "TB1": { label: "TB1", start: null, choice: true },
  "TB2": { label: "TB2", start: null, choice: true },
  "UTB": { label: "UTB", start: null, choice: true }
};

export function createMatchState(formatKey = DEFAULT_MATCH_FORMAT) {
  const format = MATCH_FORMATS[formatKey] || MATCH_FORMATS[DEFAULT_MATCH_FORMAT];

  return {
    formatKey,
    format,

    athleteScore: 0,
    opponentScore: 0,

     refProgress: {
    athlete: { cautions: 0, stalls: 0, penalties: 0 },
    opponent: { cautions: 0, stalls: 0, penalties: 0 }
  },

    currentRound: "1",
    roundIndex: 0,
    roundSequence: ["1", "2", "3"],

    roundStarts: { "1": "neutral" },

    choiceHistory: [],
    pendingChoice: null,

    secondPeriodFirstChooser: null,
    secondPeriodDeferred: false,

    // 🔥 ADDED
    firstScorer: null,
    firstTieBreakerChooser: null,

    winner: null,
    resultType: null,
    resultLocked: false,

    time: format.periods[0]?.seconds || 120,
    timer: null
  };
}

/* ---------------- ROUND LOGIC ---------------- */

export function getRoundSeconds(state, round = state.currentRound) {
  const period = state.format.periods.find(p => p.round === round);
  if (period) return period.seconds;

  if (round === "SV1") return 60;
  if (round === "TB1") return 30;
  if (round === "TB2") return 30;
  if (round === "UTB") return 30;

  return 120;
}

export function isTied(state) {
  return state.athleteScore === state.opponentScore;
}

export function oppositeSide(side) {
  return side === "athlete" ? "opponent" : "athlete";
}

export function getChoiceOwner(state, round = state.currentRound) {
  if (round === "2") return state.secondPeriodFirstChooser;

  if (round === "3") {
    return state.secondPeriodFirstChooser
      ? oppositeSide(state.secondPeriodFirstChooser)
      : null;
  }

  if (round === "TB1") return state.firstTieBreakerChooser;

  if (round === "TB2") {
    return state.firstTieBreakerChooser
      ? oppositeSide(state.firstTieBreakerChooser)
      : null;
  }

  if (round === "UTB") return state.firstTieBreakerChooser;

  return null;
}

export function requiresChoice(state, round = state.currentRound) {
  return Boolean(ROUND_RULES[round]?.choice && !state.roundStarts[round]);
}

/* ---------------- CHOICE OPTIONS ---------------- */

export function getChoiceOptions(state, round = state.currentRound) {
  if (!requiresChoice(state, round)) return [];

  if (round === "2") {
    if (state.secondPeriodDeferred) {
      return ["top", "bottom", "neutral"];
    }
    return ["top", "bottom", "neutral", "defer"];
  }

  if (round === "3") {
    return ["top", "bottom", "neutral"];
  }

  // 🔥 FIXED
  if (round === "UTB") {
    return ["top", "bottom"];
  }


if (round === "TB1" || round === "TB2") {
  return ["top", "bottom", "neutral"];
}
  return [];
}

export function normalizeChoiceToPosition(owner, choice) {
  if (choice === "neutral") return "neutral";

  if (choice === "top") {
    return owner === "athlete" ? "green_top" : "red_top";
  }

  if (choice === "bottom") {
    return owner === "athlete" ? "green_bottom" : "red_bottom";
  }

  if (choice === "defer") return "defer";

  return choice;
}

/* ---------------- ROUND CONTROL ---------------- */

export function beginRound(state, round) {
  state.currentRound = round;
  state.time = getRoundSeconds(state, round);

  if (round === "1" || round === "SV1") {
    state.roundStarts[round] = "neutral";
    state.pendingChoice = null;
    return;
  }

  // 🔥 FIXED: set TB1 chooser automatically
if (round === "TB1" && !state.firstTieBreakerChooser) {
  state.firstTieBreakerChooser = state.firstScorer || "athlete";
}

  if (requiresChoice(state, round)) {
    state.pendingChoice = {
      round,
      required: true,
      chooser: getChoiceOwner(state, round),
      options: getChoiceOptions(state, round)
    };
  } else {
    state.pendingChoice = null;
  }
}

export function applyRoundChoice(state, choice) {
  const round = state.currentRound;
  if (!requiresChoice(state, round)) return false;

  let chooser = getChoiceOwner(state, round);
  if (!chooser) return false;

  if (round === "2" && choice === "defer" && !state.secondPeriodDeferred) {
    state.secondPeriodDeferred = true;

    const nextChooser = oppositeSide(chooser);

    state.choiceHistory.push({
      round,
      chooser,
      choice: "defer",
      position: "defer"
    });

    state.secondPeriodFirstChooser = nextChooser;

    state.pendingChoice = {
      round,
      required: true,
      chooser: nextChooser,
      options: getChoiceOptions(state, round)
    };

    return true;
  }

  const allowed = getChoiceOptions(state, round);
  if (!allowed.includes(choice)) return false;

  const position = normalizeChoiceToPosition(chooser, choice);

  state.choiceHistory.push({
    round,
    chooser,
    choice,
    position
  });

  state.roundStarts[round] = position;
  state.pendingChoice = null;

  return true;
}

/* ---------------- ROUND FLOW ---------------- */

export function getNextRound(state) {
  const r = state.currentRound;

  if (r === "1") return "2";
  if (r === "2") return "3";

  if (r === "3") return isTied(state) ? "SV1" : null;
  if (r === "SV1") return isTied(state) ? "TB1" : null;
  if (r === "TB1") return "TB2";
  if (r === "TB2") return isTied(state) ? "UTB" : null;

  return null;
}

export function advanceRound(state) {
  const next = getNextRound(state);

  if (!next) {
    return {
      advanced: false,
      matchComplete: true
    };
  }

  if (!state.roundSequence.includes(next)) {
    state.roundSequence.push(next);
  }

  state.roundIndex = state.roundSequence.indexOf(next);

  beginRound(state, next);

  return {
    advanced: true,
    round: next,
    requiresChoice: requiresChoice(state, next),
    chooser: state.pendingChoice?.chooser || null,
    options: state.pendingChoice?.options || []
  };
}

/* ---------------- SCORING ---------------- */
export function undoScore(state, side, points) {
  if (points <= 0) return;

  if (side === "athlete") {
    state.athleteScore = Math.max(0, state.athleteScore - points);
  }

  if (side === "opponent") {
    state.opponentScore = Math.max(0, state.opponentScore - points);
  }

  if (!state.resultLocked) {
    applySuggestedMatchResult(state);
  }
}

export function applyScore(state, side, points) {
  if (points <= 0) return;

  // 🔥 FIXED: track first scorer
  if (!state.firstScorer) {
    state.firstScorer = side;
  }

  if (side === "athlete") state.athleteScore += points;
  if (side === "opponent") state.opponentScore += points;

  if (!state.resultLocked) {
    applySuggestedMatchResult(state);
  }
}

/* ---------------- RESULT ---------------- */

export function suggestMatchResult(state) {
  const { athleteScore, opponentScore } = state;

  if (athleteScore === opponentScore) {
    return { winner: null, resultType: null };
  }

  const winner = athleteScore > opponentScore ? "athlete" : "opponent";
  const margin = Math.abs(athleteScore - opponentScore);

  let resultType = "decision";

  if (margin >= 15) resultType = "tech";
  else if (margin >= 8) resultType = "major";

  return { winner, resultType };
}

export function applySuggestedMatchResult(state) {
  const r = suggestMatchResult(state);
  state.winner = r.winner;
  state.resultType = r.resultType;
}
export function getVisibleRounds(state, events = []) {
  const hasOT = events.some(e =>
    ["SV1", "TB1", "TB2", "UTB"].includes(String(e.round))
  );

  if (
    hasOT ||
    state.roundSequence.some(r =>
      ["SV1", "TB1", "TB2", "UTB"].includes(r)
    )
  ) {
    return ROUND_KEYS.filter(r =>
      state.roundSequence.includes(r)
    );
  }

  return ["1", "2", "3"];
}export function setMatchFormat(state, formatKey) {
  const format = MATCH_FORMATS[formatKey];
  if (!format) return;

  state.formatKey = formatKey;
  state.format = format;

  // reset core match state
  state.athleteScore = 0;
  state.opponentScore = 0;

  state.refProgress = {
  athlete: { cautions: 0, stalls: 0, penalties: 0 },
  opponent: { cautions: 0, stalls: 0, penalties: 0 }
};

  state.currentRound = "1";
  state.roundIndex = 0;
  state.roundSequence = ["1", "2", "3"];

  state.roundStarts = { "1": "neutral" };

  state.choiceHistory = [];
  state.pendingChoice = null;

  state.secondPeriodFirstChooser = null;
  state.secondPeriodDeferred = false;

  state.firstScorer = null;
  state.firstTieBreakerChooser = null;

  state.winner = null;
  state.resultType = null;
  state.resultLocked = false;

  state.time = format.periods[0]?.seconds || 120;
}
export function setMatchResult(state, winner, resultType, locked = true) {
  state.winner = winner || null;
  state.resultType = resultType || null;
  state.resultLocked = locked;
}
export function setSecondPeriodFirstChooser(state, side) {
  if (!["athlete", "opponent"].includes(side)) return false;

  state.secondPeriodFirstChooser = side;

  // 🔥 if we're currently in R2, update the pending choice immediately
  if (state.currentRound === "2" && requiresChoice(state, "2")) {
    state.pendingChoice = {
      round: "2",
      required: true,
      chooser: side,
      options: getChoiceOptions(state, "2")
    };
  }

  return true;
}