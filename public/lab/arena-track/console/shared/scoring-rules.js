export const SCORING_RULES = {
  td3: { label: "Takedown", points: 3 },
  esc1: { label: "Escape", points: 1 },
  rev2: { label: "Reversal", points: 2 },

  nf2: { label: "Nearfall", points: 2 },
  nf3: { label: "Nearfall", points: 3 },
  nf4: { label: "Nearfall", points: 4 },

  caution: { label: "Caution", points: 0, refCall: true },
  stall: { label: "Stalling", points: 0, refCall: true },
  lockedHands: { label: "Locked Hands", points: 0, refCall: true },

  choiceTop: { label: "Choice: Top", points: 0 },
  choiceBottom: { label: "Choice: Bottom", points: 0 },
  choiceNeutral: { label: "Choice: Neutral", points: 0 },
  choiceDefer: { label: "Choice: Defer", points: 0 }
  
};export const REF_PROGRESSIONS = {
  caution: [0, 1, 1, 2, "DQ"],
  stall:   [0, 1, 1, 2, "DQ"],
  lockedHands: [1, 1, 2, "DQ"]
};