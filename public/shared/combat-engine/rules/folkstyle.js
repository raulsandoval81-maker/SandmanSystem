import { EVENT_TYPES, WIN_METHODS } from "../types.js";

export const folkstyleRules = Object.freeze({
  id: "folkstyle",
  name: "Folkstyle Wrestling V1",
  governingStyle: "NFHS/NCAA-inspired V1",
  techFallLead: 15,

  scoring: {
    [EVENT_TYPES.TAKEDOWN]: 3,
    [EVENT_TYPES.ESCAPE]: 1,
    [EVENT_TYPES.REVERSAL]: 2,
    nearfall: {
      2: 2,
      3: 3,
      4: 4,
    },
    penaltyDefault: 1,
  },

  winMethods: {
    fall: WIN_METHODS.FALL,
    tech: WIN_METHODS.TECH_FALL,
    points: WIN_METHODS.POINTS,
  },

  notes: [
    "Folkstyle V1 supports takedown, escape, reversal, nearfall, penalty, fall, and tech fall.",
    "No riding time, overtime, caution ladder, injury time, blood time, or referee criteria yet.",
    "Combat Engine does not award Sandman XP.",
  ],
});