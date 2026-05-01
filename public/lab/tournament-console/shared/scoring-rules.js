export const SCORING_RULES = {
  td3: { label: "Takedown", points: 3 },
  esc1: { label: "Escape", points: 1 },
  rev2: { label: "Reversal", points: 2 },

  nf2: { label: "Nearfall", points: 2 },
  nf3: { label: "Nearfall", points: 3 },
  nf4: { label: "Nearfall", points: 4 },

  pen1: { label: "Penalty", points: 1 },
  pen2: { label: "Penalty", points: 2 },

  stallWarn: { label: "Stall Warning", points: 0 },
  stall1: { label: "Stalling", points: 1 },
  stall2: { label: "Stalling", points: 2 },

  caution: { label: "Caution", points: 0 },

  choiceTop: { label: "Choice: Top", points: 0 },
  choiceBottom: { label: "Choice: Bottom", points: 0 },
  choiceNeutral: { label: "Choice: Neutral", points: 0 },
  choiceDefer: { label: "Choice: Defer", points: 0 }
};