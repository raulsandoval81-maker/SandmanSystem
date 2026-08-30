import {
  SANDMAN_PRICING_CATALOG
} from "./sandman-pricing-catalog.js";

const PRICING = SANDMAN_PRICING_CATALOG;

const FAMILY_MONTHLY = {
  1: PRICING.combat.standardFamily.athlete1,
  2: PRICING.combat.standardFamily.athlete2Total,
  3: PRICING.combat.standardFamily.athlete3Total,
  4: PRICING.combat.standardFamily.athlete4Total
};

function getDisciplineCount(athlete) {
  return Array.isArray(athlete.disciplines)
    ? athlete.disciplines.length
    : 0;
}

function isHighCombatAccess(athlete) {
  return athlete.trainingAccess === "4-6";
}

function getStandardCombatRate(athlete) {
  const disciplineCount =
    getDisciplineCount(athlete);

  const highAccess =
    isHighCombatAccess(athlete);

  if (disciplineCount >= 2) {
    return highAccess
      ? PRICING.combat.standard
          .twoDisciplineHighAccess
      : PRICING.combat.standard
          .twoDisciplineLowAccess;
  }

  return highAccess
    ? PRICING.combat.standard
        .oneDisciplineHighAccess
    : PRICING.combat.standard
        .oneDisciplineLowAccess;
}

function getStandardUpgrade(athlete) {
  return Math.max(
    0,
    getStandardCombatRate(athlete) -
      PRICING.combat.standard
        .oneDisciplineLowAccess
  );
}

function getFitnessRate(athlete) {
  return athlete.trainingAccess === "3"
    ? PRICING.fitness.threeDays
    : PRICING.fitness.twoDays;
}

export function calculateSandmanMembershipPricing(
  athletes = []
) {
  const standardAthletes =
    athletes.filter(
      (athlete) =>
        athlete.plan === "standard"
    );

  const mmaAthletes =
    athletes.filter(
      (athlete) =>
        athlete.plan === "mma"
    );

  const fitnessAthletes =
    athletes.filter(
      (athlete) =>
        athlete.plan === "fitness"
    );

  const comboAthletes =
    athletes.filter(
      (athlete) =>
        athlete.plan === "combo"
    );

  /*
   * STANDARD COMBAT
   *
   * Base family ladder remains intact.
   * Higher access is layered on top.
   *
   * Important:
   * 2 disciplines + 4-6 days = $120,
   * NOT $140.
   */
  let standardCombatMonthly = 0;

  let standardIndividualEquivalentMonthly = 0;

  if (standardAthletes.length > 0) {
    const count =
      standardAthletes.length;

    if (count <= 4) {
      standardCombatMonthly =
        FAMILY_MONTHLY[count];
    } else {
      standardCombatMonthly =
        FAMILY_MONTHLY[4] +
        (
          count - 4
        ) *
        PRICING.combat.standardFamily
          .additionalAthlete;
    }

    standardAthletes.forEach(
      (athlete) => {
        standardIndividualEquivalentMonthly +=
          getStandardCombatRate(athlete);

        standardCombatMonthly +=
          getStandardUpgrade(athlete);
      }
    );
  }

  /*
   * MMA
   *
   * This is an intentional membership path.
   * It is NOT inferred from discipline count.
   */
  const mmaMonthly =
    mmaAthletes.length *
    PRICING.combat.mma.monthly;

  const mmaIndividualEquivalentMonthly =
    mmaMonthly;

  /*
   * FITNESS
   */
  let fitnessMonthly = 0;

  fitnessAthletes.forEach(
    (athlete) => {
      fitnessMonthly +=
        getFitnessRate(athlete);
    }
  );

  const fitnessIndividualEquivalentMonthly =
    fitnessMonthly;

  /*
   * Existing Combo pricing stays untouched
   * until Combo is intentionally redesigned.
   */
  let comboMonthly = 0;

  comboAthletes.forEach(
    (athlete) => {
      comboMonthly +=
        athlete.billingTerm === "annual"
          ? PRICING.combo.annualAutopay
          : PRICING.combo.monthToMonth;
    }
  );

  const comboAgreementCount =
    comboAthletes.filter(
      (athlete) =>
        athlete.billingTerm === "annual"
    ).length;

  const agreementSavingsAnnual =
    comboAgreementCount *
    (
      PRICING.combo.monthToMonth -
      PRICING.combo.annualAutopay
    ) *
    12;

  /*
   * Family savings before household cap.
   */
  const standardFamilySavingsAnnual =
    Math.max(
      0,
      standardIndividualEquivalentMonthly -
        standardCombatMonthly
    ) * 12;

  const membershipBeforeCap =
    standardCombatMonthly +
    mmaMonthly +
    fitnessMonthly +
    comboMonthly;

  /*
   * $250 HOUSEHOLD CAP
   */
  const householdCap =
    PRICING.household.monthlyCap;

  const householdCapSavingsMonthly =
    Math.max(
      0,
      membershipBeforeCap -
        householdCap
    );

  const membershipAfterCap =
    Math.min(
      membershipBeforeCap,
      householdCap
    );

  /*
   * OPTIONAL PARENT + CHILD PROMOTION
   *
   * Promotion is deliberately separate from
   * family pricing and household savings.
   */
  const hasQualifyingCombatMember =
    athletes.some(
      (athlete) =>
        athlete.plan === "standard" ||
        athlete.plan === "combo" ||
        athlete.plan === "mma"
    );

  const parentPromotionCount =
    fitnessAthletes.filter(
      (athlete) => {
        const combatFamilyTwoDayRate =
          athlete.trainingAccess === "2" &&
          hasQualifyingCombatMember;

        const annualThreeDayRate =
          athlete.trainingAccess === "3" &&
          athlete.billingTerm === "annual";

        return (
          combatFamilyTwoDayRate ||
          annualThreeDayRate
        );
      }
    ).length;

  const promotionMonthly =
    parentPromotionCount *
    PRICING.promotions.parentChildMonthly;

  const monthlyMembership =
    Math.max(
      0,
      membershipAfterCap -
        promotionMonthly
    );

  const promotionalSavingsAnnual =
    promotionMonthly * 12;

  const projectedSavingsAnnual =
    standardFamilySavingsAnnual +
    householdCapSavingsMonthly * 12 +
    agreementSavingsAnnual;

  const individualEquivalentMonthly =
    standardIndividualEquivalentMonthly +
    mmaIndividualEquivalentMonthly +
    fitnessIndividualEquivalentMonthly +
    comboMonthly;

  return {
    standardCombatMonthly,
    standardIndividualEquivalentMonthly,
    standardFamilySavingsAnnual,

    mmaMonthly,
    mmaIndividualEquivalentMonthly,

    fitnessMonthly,
    fitnessIndividualEquivalentMonthly,

    comboMonthly,
    agreementSavingsAnnual,

    individualEquivalentMonthly,

    membershipBeforeCap,

    householdCap,
    householdCapSavingsMonthly,

    promotionMonthly,
    promotionalSavingsAnnual,

    projectedSavingsAnnual,

    monthlyMembership
  };
}
