import { HttpsError } from "firebase-functions/v2/https";

import {
  WINTER_WRESTLING_2026_27,
  WINTER_WRESTLING_SCHEDULES,
  WinterWrestlingSchedule,
  buildWinterWrestlingSchedule,
  winterWrestlingProration,
} from "./winterWrestlingSeasonPolicy";

export const SEASONAL_BILLING_TYPE = "seasonal_one_time";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export function isSeasonalProposalPricing(pricing: unknown): boolean {
  return Boolean(
    pricing &&
    typeof pricing === "object" &&
    clean((pricing as Record<string, unknown>).billingType) === SEASONAL_BILLING_TYPE
  );
}

/** Canonicalizes all monetary fields on the server; the browser cannot price a season. */
export function canonicalSeasonalPricing(
  rawPricing: Record<string, unknown>,
  athletes: unknown[],
): Record<string, unknown> {
  const athleteCount = athletes.length;
  const enrollmentDate = clean(rawPricing.seasonalEnrollmentDate);
  const schedule = clean(rawPricing.trainingSchedule) as WinterWrestlingSchedule;
  const payInFull = rawPricing.payInFull === true;
  const lateEnrollmentReviewed = rawPricing.lateEnrollmentReviewed === true;

  if (!WINTER_WRESTLING_SCHEDULES.includes(schedule)) {
    throw new HttpsError(
      "invalid-argument",
      "Select an approved Winter Wrestling training schedule.",
    );
  }

  let paymentSchedule;
  let proration;
  try {
    paymentSchedule = buildWinterWrestlingSchedule(
      athleteCount,
      enrollmentDate,
      payInFull,
      schedule,
    );
    proration = winterWrestlingProration({
      athleteCount,
      enrollmentDate,
      schedule,
    });
  } catch (error) {
    throw new HttpsError(
      "invalid-argument",
      error instanceof Error ? error.message : "Invalid Winter Wrestling proposal.",
    );
  }

  return {
    billingType: SEASONAL_BILLING_TYPE,
    campaignId: WINTER_WRESTLING_2026_27.campaignId,
    seasonId: "winter-2026-27",
    seasonName: "Winter Wrestling 2026–27",
    seasonStart: WINTER_WRESTLING_2026_27.seasonStart,
    seasonEnd: WINTER_WRESTLING_2026_27.seasonEnd,
    athleteCount,
    perAthleteCents: WINTER_WRESTLING_2026_27.perAthleteCents,
    listPriceTotalCents:
      athleteCount * WINTER_WRESTLING_2026_27.perAthleteCents,
    seasonalEnrollmentDate: enrollmentDate,
    trainingSchedule: schedule,
    payInFull,
    totalCents: paymentSchedule.totalCents,
    dueNowCents: paymentSchedule.installments[0].amountCents,
    installments: paymentSchedule.installments.map((installment) => ({
      number: installment.number,
      amountCents: installment.amountCents,
      dueDate: installment.dueDate,
      status: "scheduled",
    })),
    proration: {
      method: "missed_required_practices",
      maxPercent: WINTER_WRESTLING_2026_27.maxProrationPercent,
      requiredPracticeCount: proration.requiredPracticeCount,
      missedRequiredPracticeCount: proration.missedRequiredPracticeCount,
      appliedPercent: proration.appliedPercent,
      perAthleteDiscountCents: proration.perAthleteDiscountCents,
      totalDiscountCents: proration.totalDiscountCents,
      excludesThanksgivingClosure: true,
      excludesOptionalSessions: true,
    },
    requiresLateEnrollmentReview: proration.requiresLateEnrollmentReview,
    lateEnrollmentReviewed:
      proration.requiresLateEnrollmentReview ? lateEnrollmentReviewed : true,
    enrollmentCutoff: null,
    enrollmentCutoffConfirmationRequired: true,
    automaticFuturePayments: false,
  };
}

export function canonicalizeProposalPricing(
  rawPricing: unknown,
  athletes: unknown[],
): Record<string, unknown> {
  const pricing = rawPricing && typeof rawPricing === "object"
    ? rawPricing as Record<string, unknown>
    : {};
  return isSeasonalProposalPricing(pricing)
    ? canonicalSeasonalPricing(pricing, athletes)
    : pricing;
}

export function assertSeasonalProposalReady(pricing: unknown): void {
  if (!isSeasonalProposalPricing(pricing)) return;
  const value = pricing as Record<string, unknown>;
  if (
    value.requiresLateEnrollmentReview === true &&
    value.lateEnrollmentReviewed !== true
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Management must review and approve this late-enrollment adjustment before client review.",
    );
  }
}
