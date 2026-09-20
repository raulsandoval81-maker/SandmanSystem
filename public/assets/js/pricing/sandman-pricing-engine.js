import {
  SANDMAN_PRICING_CATALOG
} from "./sandman-pricing-catalog.js";

const PRICING =
  SANDMAN_PRICING_CATALOG;

const ACCESS_ORDER =
  PRICING.combat.accessOrder;

function normalizeCombatAccess(
  value
) {
  if (
    ACCESS_ORDER.includes(value)
  ) {
    return value;
  }

  if (value === "4-6") {
    return "classes-4";
  }

  return "core-2";
}

function normalizeBillingTerm(
  value
) {
  if (value === "annual") {
    return "annual";
  }

  if (
    value === "six-month" ||
    value === "sixMonth"
  ) {
    return "sixMonth";
  }

  return "monthToMonth";
}

function termCommitmentRank(
  term
) {
  if (term === "annual") {
    return 1;
  }

  if (term === "sixMonth") {
    return 2;
  }

  return 3;
}

function householdSize(
  count
) {
  return String(
    Math.min(
      4,
      Math.max(1, count)
    )
  );
}

function singleCombatRecord(
  athlete
) {
  const access =
    normalizeCombatAccess(
      athlete.trainingAccess
    );

  return PRICING.combat
    .householdPricing["1"][access];
}

function singleCombatRate(
  athlete
) {
  const record =
    singleCombatRecord(athlete);

  const term =
    normalizeBillingTerm(
      athlete.billingTerm
    );

  return record[term].amount;
}

function highestFamilyAccess(
  athletes
) {
  let highestIndex = 0;

  athletes.forEach(
    (athlete) => {
      const access =
        normalizeCombatAccess(
          athlete.trainingAccess
        );

      const index =
        ACCESS_ORDER.indexOf(
          access
        );

      if (index > highestIndex) {
        highestIndex = index;
      }
    }
  );

  return ACCESS_ORDER[
    highestIndex
  ];
}

function familyBillingTerm(
  athletes
) {
  let selected =
    "annual";

  athletes.forEach(
    (athlete) => {
      const term =
        normalizeBillingTerm(
          athlete.billingTerm
        );

      if (
        termCommitmentRank(term) >
        termCommitmentRank(selected)
      ) {
        selected = term;
      }
    }
  );

  return selected;
}

function familyCombatRecord(
  athletes
) {
  const size =
    householdSize(
      athletes.length
    );

  const access =
    highestFamilyAccess(
      athletes
    );

  const term =
    familyBillingTerm(
      athletes
    );

  const record =
    PRICING.combat
      .householdPricing[size][
        access
      ][term];

  return {
    size,
    access,
    term,
    amount: record.amount,
    lookup: record.lookup
  };
}

function fitnessRecord(
  athlete
) {
  return (
    athlete.trainingAccess === "3"
      ? PRICING.fitness.threeDays
      : PRICING.fitness.twoDays
  );
}

export function calculateSandmanMembershipPricing(
  athletes = []
) {
  const combatAthletes =
    athletes.filter(
      (athlete) =>
        athlete.plan === "standard"
    );

  const fitnessAthletes =
    athletes.filter(
      (athlete) =>
        athlete.plan === "fitness"
    );

  const catalogItems = [];

  const individualCombatEquivalent =
    combatAthletes.reduce(
      (total, athlete) =>
        total +
        singleCombatRate(
          athlete
        ),
      0
    );

  let standardCombatMonthly = 0;

  if (
    combatAthletes.length >= 2
  ) {
    const family =
      familyCombatRecord(
        combatAthletes
      );

    standardCombatMonthly =
      family.amount;

    catalogItems.push({
      kind: "combat-family",
      recurring: true,
      householdSize:
        family.size,
      trainingAccess:
        family.access,
      billingTerm:
        family.term,
      lookupKey:
        family.lookup,
      amount:
        family.amount,
      quantity: 1
    });
  } else if (
    combatAthletes.length === 1
  ) {
    const athlete =
      combatAthletes[0];

    const access =
      normalizeCombatAccess(
        athlete.trainingAccess
      );

    const term =
      normalizeBillingTerm(
        athlete.billingTerm
      );

    const record =
      PRICING.combat
        .householdPricing["1"][
          access
        ][term];

    standardCombatMonthly =
      record.amount;

    catalogItems.push({
      kind: "combat-individual",
      recurring: true,
      athleteIndex:
        athlete.index ?? null,
      trainingAccess:
        access,
      billingTerm:
        term,
      lookupKey:
        record.lookup,
      amount:
        record.amount,
      quantity: 1
    });
  }

  let fitnessMonthly = 0;

  fitnessAthletes.forEach(
    (athlete) => {
      const record =
        fitnessRecord(
          athlete
        );

      fitnessMonthly +=
        record.monthly;

      catalogItems.push({
        kind: "fitness",
        recurring: true,
        athleteIndex:
          athlete.index ?? null,
        lookupKey:
          record.lookup,
        amount:
          record.monthly,
        quantity: 1
      });
    }
  );

  const monthlyMembership =
    standardCombatMonthly +
    fitnessMonthly;

  const standardFamilySavingsAnnual =
    Math.max(
      0,
      individualCombatEquivalent -
        standardCombatMonthly
    ) * 12;

  const agreementSavingsAnnual =
    combatAthletes.reduce(
      (total, athlete) => {
        const access =
          normalizeCombatAccess(
            athlete.trainingAccess
          );

        const selectedTerm =
          normalizeBillingTerm(
            athlete.billingTerm
          );

        const record =
          PRICING.combat
            .householdPricing["1"][
              access
            ];

        return (
          total +
          (
            record.monthToMonth.amount -
            record[selectedTerm].amount
          ) * 12
        );
      },
      0
    );

  return {
    pricingModel:
      PRICING.version,

    catalogItems,

    standardCombatMonthly,

    standardIndividualEquivalentMonthly:
      individualCombatEquivalent,

    standardFamilySavingsAnnual,

    fitnessMonthly,

    fitnessIndividualEquivalentMonthly:
      fitnessMonthly,

    agreementSavingsAnnual,

    projectedSavingsAnnual:
      standardFamilySavingsAnnual +
      agreementSavingsAnnual,

    individualEquivalentMonthly:
      individualCombatEquivalent +
      fitnessMonthly,

    membershipBeforeCap:
      monthlyMembership,

    monthlyMembership,

    mmaMonthly: 0,
    mmaIndividualEquivalentMonthly: 0,
    comboMonthly: 0,
    householdCap: null,
    householdCapSavingsMonthly: 0,
    promotionMonthly: 0,
    promotionalSavingsAnnual: 0,

    paymentOwnership: {
      sandman: {
        combatMonthly:
          standardCombatMonthly
      },

      youthEmpowered: {
        fitnessMonthly
      }
    }
  };
}
