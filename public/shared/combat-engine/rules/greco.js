import { EVENT_TYPES, WIN_METHODS } from "../types.js";

export const grecoRules = Object.freeze({
  id: "greco",
  name: "Greco-Roman Wrestling V1",
  governingStyle: "UWW-inspired V1",
  techFallLead: 8,

  scoring: {
    [EVENT_TYPES.TAKEDOWN]: 2,
    [EVENT_TYPES.EXPOSURE]: 2,
    [EVENT_TYPES.REVERSAL]: 1,
    [EVENT_TYPES.THROW]: 4,
    bigThrow: 5,
    penaltyDefault: 1,
  },

  restrictions: {
    noLegAttacks: true,
    noTrips: true,
    noActiveLegUse: true,
  },

  winMethods: {
    fall: WIN_METHODS.FALL,
    tech: WIN_METHODS.TECH_SUPERIORITY,
    points: WIN_METHODS.POINTS,
  },

  notes: [
    "Greco V1 supports upper-body takedown, exposure, reversal, throw, big throw, penalty, fall, and tech superiority.",
    "Leg attacks are marked illegal by rule metadata, but full illegal-action enforcement comes later.",
    "No full passivity/par terre system yet.",
    "Combat Engine does not award Sandman XP.",
  ],
});