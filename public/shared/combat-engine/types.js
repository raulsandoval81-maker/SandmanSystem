export const WRESTLERS = Object.freeze({
  GREEN: "green",
  RED: "red",
});

export const POSITIONS = Object.freeze({
  NEUTRAL: "neutral",
  GREEN_TOP: "green_top",
  RED_TOP: "red_top",
  ENDED: "ended",
});

export const MATCH_STATUS = Object.freeze({
  LIVE: "live",
  ENDED: "ended",
});

export const WIN_METHODS = Object.freeze({
  FALL: "fall",
  TECH_FALL: "tech_fall",
  TECH_SUPERIORITY: "technical_superiority",
  POINTS: "points",
  FORFEIT: "forfeit",
  INJURY_DEFAULT: "injury_default",
  DISQUALIFICATION: "disqualification",
});

export const EVENT_TYPES = Object.freeze({
  TAKEDOWN: "takedown",
  ESCAPE: "escape",
  REVERSAL: "reversal",
  NEARFALL: "nearfall",
  EXPOSURE: "exposure",
  STEP_OUT: "step_out",
  PUSH_OUT: "push_out",
  THROW: "throw",
  FEET_TO_BACK: "feet_to_back",
  PIN: "pin",
  FALL: "fall",
  PENALTY: "penalty",
  END_PERIOD: "end_period",
  END_MATCH: "end_match",
});

export function opponentOf(wrestler) {
  if (wrestler === WRESTLERS.GREEN) return WRESTLERS.RED;
  if (wrestler === WRESTLERS.RED) return WRESTLERS.GREEN;
  throw new Error(`Invalid wrestler: ${wrestler}`);
}

export function topPositionFor(wrestler) {
  if (wrestler === WRESTLERS.GREEN) return POSITIONS.GREEN_TOP;
  if (wrestler === WRESTLERS.RED) return POSITIONS.RED_TOP;
  throw new Error(`Invalid wrestler: ${wrestler}`);
}

export function createInitialMatchState({ style = "folkstyle", greenName = "Green", redName = "Red" } = {}) {
  return {
    style,
    status: MATCH_STATUS.LIVE,
    position: POSITIONS.NEUTRAL,
    winner: null,
    winMethod: null,
    green: {
      id: WRESTLERS.GREEN,
      name: greenName,
      score: 0,
    },
    red: {
      id: WRESTLERS.RED,
      name: redName,
      score: 0,
    },
    events: [],
  };
}