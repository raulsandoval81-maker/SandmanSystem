export const MATCH_FORMATS = {
  youth_1min: {
    label: "Youth — 1:00 Rounds",
    division: "youth",
    bracketType: "standard",
    periods: [
      { round: "1", seconds: 60, start: "neutral" },
      { round: "2", seconds: 60, start: "choice" },
      { round: "3", seconds: 60, start: "choice" }
    ],
    overtime: true
  },

  jv_90sec: {
    label: "JV — 1:30 Rounds",
    division: "jv",
    bracketType: "championship",
    periods: [
      { round: "1", seconds: 90, start: "neutral" },
      { round: "2", seconds: 90, start: "choice" },
      { round: "3", seconds: 90, start: "choice" }
    ],
    overtime: true
  },

  jv_consolation: {
    label: "JV Consolation — 1:00 / 1:30 / 1:30",
    division: "jv",
    bracketType: "consolation",
    periods: [
      { round: "1", seconds: 60, start: "neutral" },
      { round: "2", seconds: 90, start: "choice" },
      { round: "3", seconds: 90, start: "choice" }
    ],
    overtime: true
  },

  varsity_championship: {
    label: "Varsity Championship — 2:00 Rounds",
    division: "varsity",
    bracketType: "championship",
    periods: [
      { round: "1", seconds: 120, start: "neutral" },
      { round: "2", seconds: 120, start: "choice" },
      { round: "3", seconds: 120, start: "choice" }
    ],
    overtime: true
  },

  varsity_consolation: {
    label: "Varsity Consolation — 1:00 / 2:00 / 2:00",
    division: "varsity",
    bracketType: "consolation",
    periods: [
      { round: "1", seconds: 60, start: "neutral" },
      { round: "2", seconds: 120, start: "choice" },
      { round: "3", seconds: 120, start: "choice" }
    ],
    overtime: true
  },

  college_3_2_2: {
    label: "College — 3:00 / 2:00 / 2:00",
    division: "college",
    bracketType: "standard",
    periods: [
      { round: "1", seconds: 180, start: "neutral" },
      { round: "2", seconds: 120, start: "choice" },
      { round: "3", seconds: 120, start: "choice" }
    ],
    overtime: true,
    ridingTime: true
  }
};

export const DEFAULT_MATCH_FORMAT = "varsity_championship";