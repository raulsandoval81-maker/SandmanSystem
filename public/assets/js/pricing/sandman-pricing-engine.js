import {
  SANDMAN_PRICING_CATALOG
} from "./sandman-pricing-catalog.js";

const PRICING = SANDMAN_PRICING_CATALOG;

function disciplineCount(athlete) {
  const count =
    Array.isArray(athlete.disciplines)
      ? athlete.disciplines.length
      : 0;

  return count >= 2 ? 2 : 1;
}

function combatAccess(athlete) {
  return athlete.trainingAccess === "4-6"
    ? "4-6"
    : "2-3";
}

function isAnnual(athlete) {
  return athlete.billingTerm === "annual";
}

function combatRateRecord(athlete) {
  const group =
    disciplineCount(athlete) >= 2
      ? PRICING.combat.individual
          .twoDisciplines
      : PRICING.combat.individual
          .oneDiscipline;

  return group[combatAccess(athlete)];
}

function individualCombatRate(athlete) {
  const record =
    combatRateRecord(athlete);

  return isAnnual(athlete)
    ? record.annual
    : record.monthToMonth;
}

function individualCombatLookup(athlete) {
  const record =
    combatRateRecord(athlete);

  return isAnnual(athlete)
    ? record.annualLookup
    : record.monthToMonthLookup;
}

function familyCombatRecord(athletes) {
  const hasTwoDisciplines =
    athletes.some(
      (athlete) =>
        disciplineCount(athlete) >= 2
    );

  const hasHighAccess =
    athletes.some(
      (athlete) =>
        combatAccess(athlete) === "4-6"
    );

  if (
    hasTwoDisciplines &&
    hasHighAccess
  ) {
    return PRICING.combat.family12Month
      .twoDisciplines46;
  }

  if (hasTwoDisciplines) {
    return PRICING.combat.family12Month
      .twoDisciplines23;
  }

  if (hasHighAccess) {
    return PRICING.combat.family12Month
      .oneDiscipline46;
  }

  return PRICING.combat.family12Month
    .oneDiscipline23;
}

function fitnessRecord(athlete) {
  return athlete.trainingAccess === "3"
    ? PRICING.fitness.threeDays
    : PRICING.fitness.twoDays;
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
        individualCombatRate(athlete),
      0
    );

  const allCombatAnnual =
    combatAthletes.length > 0 &&
    combatAthletes.every(isAnnual);

  let standardCombatMonthly = 0;

  if (
    combatAthletes.length >= 2 &&
    allCombatAnnual
  ) {
    const family =
      familyCombatRecord(
        combatAthletes
      );

    standardCombatMonthly =
      family.monthly;

    catalogItems.push({
      kind: "combat-family",
      recurring: true,
      lookupKey: family.lookup,
      amount: family.monthly,
      quantity: 1
    });
  } else {
    combatAthletes.forEach(
      (athlete) => {
        const amount =
          individualCombatRate(
            athlete
          );

        standardCombatMonthly +=
          amount;

        catalogItems.push({
          kind: "combat-individual",
          recurring: true,
          athleteIndex:
            athlete.index ?? null,
          lookupKey:
            individualCombatLookup(
              athlete
            ),
          amount,
          quantity: 1
        });
      }
    );
  }

  let fitnessMonthly = 0;

  fitnessAthletes.forEach(
    (athlete) => {
      const record =
        fitnessRecord(athlete);

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
        if (!isAnnual(athlete)) {
          return total;
        }

        const record =
          combatRateRecord(athlete);

        return (
          total +
          (
            record.monthToMonth -
            record.annual
          ) * 12
        );
      },
      0
    );

  const projectedSavingsAnnual =
    standardFamilySavingsAnnual +
    agreementSavingsAnnual;

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

    projectedSavingsAnnual,

    individualEquivalentMonthly:
      individualCombatEquivalent +
      fitnessMonthly,

    membershipBeforeCap:
      monthlyMembership,

    monthlyMembership,

    /*
     * Legacy compatibility fields.
     * These intentionally remain zero while
     * old rendering code is removed.
     */
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
