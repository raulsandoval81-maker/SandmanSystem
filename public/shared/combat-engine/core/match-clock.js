export const MATCH_CLOCKS = Object.freeze({
  folkstyle: {
    name: "Folkstyle Wrestling",
    periods: [
      { number: 1, seconds: 120 },
      { number: 2, seconds: 120 },
      { number: 3, seconds: 120 },
    ],
    overtime: {
      suddenVictory: 60,
      tiebreaker1: 30,
      tiebreaker2: 30,
      ultimateTiebreaker: 30,
    },
  },

  freestyle: {
    name: "Freestyle Wrestling",
    periods: [
      { number: 1, seconds: 180 },
      { number: 2, seconds: 180 },
    ],
    overtime: null,
  },

  greco: {
    name: "Greco-Roman Wrestling",
    periods: [
      { number: 1, seconds: 180 },
      { number: 2, seconds: 180 },
    ],
    overtime: null,
  },

  beach: {
    name: "Beach Wrestling",
    periods: [
      { number: 1, seconds: 180 },
    ],
    overtime: null,
  },
});

export function getClock(style = "folkstyle") {
  const clock = MATCH_CLOCKS[style];

  if (!clock) {
    throw new Error(`Unknown clock style: ${style}`);
  }

  return clock;
}

export function createClockState(style = "folkstyle") {
  const clock = getClock(style);

  return {
    style,
    running: false,
    currentPeriod: 1,
    timeRemaining: clock.periods[0].seconds,
    elapsed: 0,
    matchComplete: false,
  };
}