export const SCORING_RULES = {
  td3: {
    label: "Takedown",
    short: "TD",
    points: 3,
    category: "offense",
    phase: "neutral"
  },

  esc1: {
    label: "Escape",
    short: "ESC",
    points: 1,
    category: "bottom",
    phase: "bottom"
  },

  rev2: {
    label: "Reversal",
    short: "REV",
    points: 2,
    category: "bottom",
    phase: "bottom"
  },

  nf2: {
    label: "Nearfall 2",
    short: "NF2",
    points: 2,
    category: "top",
    phase: "top"
  },

  nf3: {
    label: "Nearfall 3",
    short: "NF3",
    points: 3,
    category: "top",
    phase: "top"
  },

  nf4: {
    label: "Nearfall 4",
    short: "NF4",
    points: 4,
    category: "top",
    phase: "top"
  },

lockedHands: {
  label: "Locked Hands",
  short: "LH",
  points: 0,
  category: "official",
  phase: "official",
  refCall: true
},

  stall: {
    label: "Stalling",
    short: "STALL",
    points: 0,
    category: "official",
    phase: "official",
    refCall: true
  },

  caution: {
    label: "Caution",
    short: "CAUTION",
    points: 0,
    category: "official",
    phase: "official",
    refCall: true
  }
};

export const RESULT_TYPES = [
  { key: "decision", label: "Decision", minDiff: 1, maxDiff: 7 },
  { key: "major", label: "Major Decision", minDiff: 8, maxDiff: 14 },
  { key: "tech", label: "Tech Fall", minDiff: 15 },
  { key: "pin", label: "Pin" },
  { key: "dq", label: "DQ" },
  { key: "forfeit", label: "Forfeit" }
];

export const REF_PROGRESSIONS = {
  caution: [0, 1, 1, 2, "DQ"],
  stall:   [0, 1, 1, 2, "DQ"],
  lockedHands: [1, 1, 2, "DQ"]
};
export function isRefCallAllowed(state, side, callType) {
  if (callType === "caution") return { allowed: true };
  if (callType === "stall") return { allowed: true };

  if (callType === "lockedHands") {
    const allowed =
      (state.position === "green_top" && side === "athlete") ||
      (state.position === "red_top" && side === "opponent");

    return {
      allowed,
      message: allowed ? "" : "Locked hands only applies to top wrestler"
    };
  }

  return { allowed: true };
}