const PREFIX = "sandman_academy-2026-v4_";

function recurringRate(
  amount,
  lookup
) {
  return {
    amount,
    lookup
  };
}

function accessRecord(
  household,
  accessKey,
  annual,
  sixMonth,
  monthToMonth
) {
  return {
    annual: recurringRate(
      annual,
      `${PREFIX}combat_h${household}_${accessKey}_12mo`
    ),

    sixMonth: recurringRate(
      sixMonth,
      `${PREFIX}combat_h${household}_${accessKey}_6mo`
    ),

    monthToMonth: recurringRate(
      monthToMonth,
      `${PREFIX}combat_h${household}_${accessKey}_mtm`
    )
  };
}

export const SANDMAN_PRICING_CATALOG = {
  version: "ACADEMY_2026_V4",
  effectiveFrom: "2026-09-19",
  stripeLookupPrefix: PREFIX,

  combat: {
    accessOrder: [
      "core-2",
      "competition-3",
      "classes-4",
      "discipline-5",
      "dual-full"
    ],

    accessLevels: {
      "core-2": {
        label: "2-Day Core",
        description:
          "Two regular class days per person in one selected discipline."
      },

      "competition-3": {
        label: "3-Day Competition Track",
        description:
          "Two regular class days plus one Strength & Honor, sparring, team-development, or competition-development day."
      },

      "classes-4": {
        label: "4-Day Classes",
        description:
          "Four regular class days per person. May stay in one discipline or split across two approved disciplines."
      },

      "discipline-5": {
        label: "5-Day",
        description:
          "Five-day access centered on one approved discipline per person."
      },

      "dual-full": {
        label: "Dual-Discipline Full Access",
        description:
          "Broad scheduled access across up to two approved disciplines per person."
      }
    },

    householdPricing: {
      "1": {
        "core-2":
          accessRecord(1, "core2", 80, 90, 100),

        "competition-3":
          accessRecord(1, "comp3", 100, 110, 120),

        "classes-4":
          accessRecord(1, "class4", 120, 130, 140),

        "discipline-5":
          accessRecord(1, "day5", 130, 140, 150),

        "dual-full":
          accessRecord(1, "dual", 160, 170, 180)
      },

      "2": {
        "core-2":
          accessRecord(2, "core2", 120, 130, 140),

        "competition-3":
          accessRecord(2, "comp3", 140, 150, 160),

        "classes-4":
          accessRecord(2, "class4", 180, 190, 200),

        "discipline-5":
          accessRecord(2, "day5", 200, 210, 220),

        "dual-full":
          accessRecord(2, "dual", 240, 250, 260)
      },

      "3": {
        "core-2":
          accessRecord(3, "core2", 160, 170, 180),

        "competition-3":
          accessRecord(3, "comp3", 180, 190, 200),

        "classes-4":
          accessRecord(3, "class4", 220, 230, 240),

        "discipline-5":
          accessRecord(3, "day5", 240, 250, 260),

        "dual-full":
          accessRecord(3, "dual", 280, 290, 300)
      },

      "4": {
        "core-2":
          accessRecord(4, "core2", 200, 210, 220),

        "competition-3":
          accessRecord(4, "comp3", 220, 230, 240),

        "classes-4":
          accessRecord(4, "class4", 240, 250, 260),

        "discipline-5":
          accessRecord(4, "day5", 260, 270, 280),

        "dual-full":
          accessRecord(4, "dual", 340, 350, 360)
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
    perAthlete: {
      amount: 30,
      includesAau: false
    }
  },

  credits: {
    admissionsDefault: 0
  }
};
