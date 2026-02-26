// functions/src/caps.ts

export type XpType =
  | "attendance"
  | "fish"
  | "tournament_show"
  | "style_bonus";

// Per-event point changes
export const DELTAS: Record<XpType, number> = {
  attendance: 10,
  fish: -5,
  tournament_show: 15,
  style_bonus: 5,
};

// Max count for each event type per month
export const CAPS_EVENTS: Record<XpType, number> = {
  attendance: 12,       // 12 practices
  fish: 4,              // penalty at most 4 times
  tournament_show: 2,   // 2 tournaments
  style_bonus: 2,       // 2 style bonuses
};
