export const SANDMAN_PRICING_CATALOG = {
  version: "ACADEMY_2026_V3",
  effectiveFrom: "2026-08-29",
  stripeLookupPrefix: "sandman_academy-2026-v3_",

  combat: {
    individual: {
      oneDiscipline: {
        "2-3": {
          monthToMonth: 85,
          annual: 80,
          monthToMonthLookup:
            "sandman_academy-2026-v3_combat_1disc_23_mtm_85",
          annualLookup:
            "sandman_academy-2026-v3_combat_1disc_23_12mo"
        },

        "4-6": {
          monthToMonth: 140,
          annual: 120,
          monthToMonthLookup:
            "sandman_academy-2026-v3_combat_1disc_46_mtm",
          annualLookup:
            "sandman_academy-2026-v3_combat_1disc_46_12mo"
        }
      },

      twoDisciplines: {
        "2-3": {
          monthToMonth: 140,
          annual: 120,
          monthToMonthLookup:
            "sandman_academy-2026-v3_combat_2disc_23_mtm",
          annualLookup:
            "sandman_academy-2026-v3_combat_2disc_23_12mo"
        },

        "4-6": {
          monthToMonth: 160,
          annual: 140,
          monthToMonthLookup:
            "sandman_academy-2026-v3_combat_2disc_46_mtm",
          annualLookup:
            "sandman_academy-2026-v3_combat_2disc_46_12mo"
        }
      }
    },

    family12Month: {
      oneDiscipline23: {
        monthly: 160,
        lookup:
          "sandman_academy-2026-v3_family_1disc_23_12mo"
      },

      oneDiscipline46: {
        monthly: 200,
        lookup:
          "sandman_academy-2026-v3_family_1disc_46_12mo"
      },

      twoDisciplines23: {
        monthly: 200,
        lookup:
          "sandman_academy-2026-v3_family_2disc_23_12mo"
      },

      twoDisciplines46: {
        monthly: 260,
        lookup:
          "sandman_academy-2026-v3_family_2disc_46_12mo"
      }
    },

    passes: {
      oneDay: {
        amount: 25,
        lookup:
          "sandman_academy-2026-v3_combat_dropin_1day"
      },

      twoDay: {
        amount: 40,
        lookup:
          "sandman_academy-2026-v3_combat_dropin_2day"
      }
    }
  },

  fitness: {
    twoDays: {
      monthly: 60,
      lookup:
        "sandman_academy-2026-v3_fitness_2day"
    },

    threeDays: {
      monthly: 80,
      lookup:
        "sandman_academy-2026-v3_fitness_3day"
    },

    dropIn: {
      amount: 15,
      lookup:
        "sandman_academy-2026-v3_fitness_dropin"
    }
  },

  enrollment: {
    youth: {
      amount: 50,
      lookup:
        "sandman_academy-2026-v3_enrollment_youth_annual"
    },

    adult: {
      amount: 25,
      lookup:
        "sandman_academy-2026-v3_enrollment_adult_annual"
    },

    family1: {
      amount: 50,
      lookup:
        "sandman_academy-2026-v3_enrollment_family_1"
    },

    family2: {
      amount: 100,
      lookup:
        "sandman_academy-2026-v3_enrollment_family_2"
    },

    family3: {
      amount: 150,
      lookup:
        "sandman_academy-2026-v3_enrollment_family_3"
    },

    family4: {
      amount: 200,
      lookup:
        "sandman_academy-2026-v3_enrollment_family_4"
    }
  },

  credits: {
    admissionsDefault: 0
  }
};
