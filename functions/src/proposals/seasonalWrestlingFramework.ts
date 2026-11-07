/**
 * Sandman wrestling campaign policy blueprint.
 *
 * Shared rules for Winter, Spring and Fall. This file is NOT wired into
 * proposal canonicalization or Stripe Checkout. A season must have approved
 * calendar dates and checkout controls before Management can activate it.
 *
 * Existing Winter V2 billing remains unchanged until an audited migration.
 */
export type WrestlingSeason = "winter" | "spring" | "fall";
export type WrestlingTrainingSchedule =
  | "monday-wednesday-saturday"
  | "tuesday-thursday-saturday";

export const SEASONAL_WRESTLING_SHARED_POLICY = Object.freeze({
  firstAthleteEarlyCents: 32000,
  firstAthleteRegularCents: 35000,
  additionalSiblingCents: 15000,
  waivedAnnualEnrollmentPerAthleteCents: 3000,
  installmentCount: 3,
  daysBetweenInstallments: 14,
  chargeFutureInstallmentsAutomatically: false,
  trainingSchedules: [
    "monday-wednesday-saturday",
    "tuesday-thursday-saturday",
  ] as const,
  monthlySubscription: false,
});

/** A placeholder is intentionally not enrollable or payable. */
export type SeasonalCampaignBlueprint = {
  season: WrestlingSeason;
  campaignId: string | null;
  seasonStart: string | null;
  seasonEnd: string | null;
  earlyRegistrationDeadline: string | null;
  capacity: number | null;
  enabledForCheckout: false;
};

export const SEASONAL_WRESTLING_CAMPAIGNS: Record<WrestlingSeason, SeasonalCampaignBlueprint> = {
  winter: {
    season: "winter",
    campaignId: "winter-wrestling-2026-27",
    seasonStart: "2026-11-30",
    seasonEnd: "2027-02-27",
    earlyRegistrationDeadline: "2026-11-27",
    capacity: 40,
    enabledForCheckout: false, // blueprint only; existing Winter V2 is separately controlled
  },
  spring: {
    season: "spring",
    campaignId: null,
    seasonStart: null,
    seasonEnd: null,
    earlyRegistrationDeadline: null,
    capacity: null,
    enabledForCheckout: false,
  },
  fall: {
    season: "fall",
    campaignId: null,
    seasonStart: null,
    seasonEnd: null,
    earlyRegistrationDeadline: null,
    capacity: null,
    enabledForCheckout: false,
  },
};

/** Tuition and waived enrollment are always represented separately. */
export function seasonalWrestlingQuote(input: {
  athleteCount: number;
  earlyRegistration: boolean;
}): {
  tuitionCents: number;
  enrollmentFeeFaceValueCents: number;
  enrollmentFeeWaivedCents: number;
  enrollmentFeeDueCents: 0;
  totalDueCents: number;
  plannedInstallmentsCents: number[];
} {
  const { athleteCount, earlyRegistration } = input;
  if (!Number.isSafeInteger(athleteCount) || athleteCount < 1) {
    throw new Error("At least one eligible athlete is required.");
  }
  // This is a quote only. Seasonal age, sibling verification, season capacity,
  // pricing lock and guardian acceptance remain mandatory before Checkout.
  const tuitionCents =
    (earlyRegistration
      ? SEASONAL_WRESTLING_SHARED_POLICY.firstAthleteEarlyCents
      : SEASONAL_WRESTLING_SHARED_POLICY.firstAthleteRegularCents) +
    (athleteCount - 1) * SEASONAL_WRESTLING_SHARED_POLICY.additionalSiblingCents;
  if (!Number.isSafeInteger(tuitionCents)) throw new Error("Unsafe tuition amount.");
  const enrollmentFeeFaceValueCents =
    athleteCount * SEASONAL_WRESTLING_SHARED_POLICY.waivedAnnualEnrollmentPerAthleteCents;
  if (!Number.isSafeInteger(enrollmentFeeFaceValueCents)) {
    throw new Error("Unsafe enrollment amount.");
  }
  const base = Math.floor(tuitionCents / 3);
  const plannedInstallmentsCents = [base, base, tuitionCents - 2 * base];
  return {
    tuitionCents,
    enrollmentFeeFaceValueCents,
    enrollmentFeeWaivedCents: enrollmentFeeFaceValueCents,
    enrollmentFeeDueCents: 0,
    totalDueCents: tuitionCents,
    plannedInstallmentsCents,
  };
}
