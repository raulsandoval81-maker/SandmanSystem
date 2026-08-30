export const SANDMAN_PRICING_CATALOG = {
  version: "FOUNDING_YEAR_2026",
  effectiveFrom: "2026-08-29",

  combat: {
    standard: {
      oneDisciplineLowAccess: 80,
      oneDisciplineHighAccess: 120,
      twoDisciplineLowAccess: 120,
      twoDisciplineHighAccess: 120
    },

    mma: {
      monthly: 140
    },

    standardFamily: {
      athlete1: 80,
      athlete2Total: 120,
      athlete3Total: 140,
      athlete4Total: 160,
      additionalAthlete: 20
    }
  },

  fitness: {
    twoDays: 60,
    threeDays: 80,

    /*
     * Temporary compatibility for screens that
     * still read fitness.monthly.
     */
    monthly: 60,

    dropIn: 15
  },

  household: {
    monthlyCap: 250
  },

  promotions: {
    parentChildMonthly: 10
  },

  combo: {
    /*
     * Existing Combo pricing is retained until
     * the Combat + Fitness model is redesigned.
     */
    monthToMonth: 140,
    annualAutopay: 120
  },

  fees: {
    annualMembership: {
      sandmanProvidesAAU: 35,
      athleteHasCurrentAAU: 5
    }
  },

  credits: {
    admissionsDefault: 0
  }
};
