import { EVENT_TYPES, WIN_METHODS } from "./types.js";

export const freestyleRules = Object.freeze({
  id: "freestyle",
  name: "Freestyle Wrestling V1",
  governingStyle: "UWW-inspired V1",
  techFallLead: 10,

  scoring: {
    [EVENT_TYPES.TAKEDOWN]: 2,
    [EVENT_TYPES.EXPOSURE]: 2,
    [EVENT_TYPES.STEP_OUT]: 1,
    [EVENT_TYPES.PUSH_OUT]: 1,
    [EVENT_TYPES.REVERSAL]: 1,
    [EVENT_TYPES.THROW]: 4,
    bigThrow: 5,
    penaltyDefault: 1,
  },

  winMethods: {
    fall: WIN_METHODS.FALL,
    tech: WIN_METHODS.TECH_SUPERIORITY,
    points: WIN_METHODS.POINTS,
  },

  notes: [
    "Freestyle V1 supports takedown, exposure, step-out, push-out, reversal, throw, big throw, penalty, fall, and tech superiority.",
    "No full UWW criteria, passivity clock, challenge brick, ordered par terre, or classification points yet.",
    "Combat Engine does not award Sandman XP.",
  ],
});