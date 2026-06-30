import { EVENT_TYPES, WIN_METHODS } from "../types.js";

export const beachRules = Object.freeze({
  id: "beach",
  name: "Beach Wrestling V1",
  governingStyle: "UWW Beach-inspired V1",
  pointsToWin: 3,

  scoring: {
    [EVENT_TYPES.TAKEDOWN]: 1,
    [EVENT_TYPES.PUSH_OUT]: 1,
    [EVENT_TYPES.STEP_OUT]: 1,
    [EVENT_TYPES.FEET_TO_BACK]: 3,
    [EVENT_TYPES.THROW]: 3,
    penaltyDefault: 1,
  },

  winMethods: {
    fall: WIN_METHODS.FALL,
    points: WIN_METHODS.POINTS,
  },

  notes: [
    "Beach V1 supports takedown, push-out, step-out, feet-to-back, throw, penalty, and first-to-3 win logic.",
    "No full beach criteria system yet.",
    "Combat Engine does not award Sandman XP.",
  ],
});