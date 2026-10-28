/**
 * Sandman Winter Wrestling 2026–2027 — approved seasonal billing policy.
 * Proposal-only. NOT a monthly subscription and NOT authorization to charge later installments.
 * Existing memberships and their Stripe catalog items must remain unchanged.
 */
export const WINTER_WRESTLING_2026_27 = {
  campaignId: "winter-wrestling-2026-27",
  productId: "prod_VWi4ha2Oagq9Dg",
  fullSeasonPriceId: "price_1UVeei2KGvRzqoOHYd3tUMAD",
  seasonStart: "2026-11-15",
  seasonEnd: "2027-02-14",
  minAge: 7,
  maxAge: 14,
  perAthleteCents: 35000,
  installmentPricesCents: {
    15000: "price_1UVehY2KGvRzqoOH04eDIS3k",
    20000: "price_1UVeha2KGvRzqoOHIhFxKnAT",
    25000: "price_1UVehc2KGvRzqoOHD87KEp5v",
    30000: "price_1UVehe2KGvRzqoOH26oCMduI",
    35000: "price_1UVeei2KGvRzqoOHYd3tUMAD",
    40000: "price_1UVehh2KGvRzqoOHGbEZuF7r",
    45000: "price_1UVehj2KGvRzqoOHKnFwIGZj",
    55000: "price_1UVehl2KGvRzqoOHJqfjJ1Zb",
    60000: "price_1UVehn2KGvRzqoOHjxfxNKf4",
    75000: "price_1UVehp2KGvRzqoOHIjAi6CzO",
  } as Record<number, string>,
  paymentAmountsCents: {
    1: [20000, 15000],
    2: [40000, 30000],
    3: [45000, 35000, 25000],
    4: [60000, 45000, 35000],
    5: [75000, 55000, 45000],
  } as Record<number, number[]>,
  laterDueDates: ["2026-12-15", "2027-01-15"],
  requiredProgramStart: "2026-11-29",
  maxProrationPercent: 25,
  enrollmentCutoff: null,
} as const;

export const WINTER_WRESTLING_SCHEDULES = [
  "monday-wednesday-saturday",
  "tuesday-thursday-saturday",
] as const;

export type WinterWrestlingSchedule =
  typeof WINTER_WRESTLING_SCHEDULES[number];

function isoDatesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const final = new Date(`${end}T12:00:00Z`);
  while (cursor <= final) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Required practices used only for an approved late-start adjustment.
 * Week 1 is the flexible Come As You Are introduction; Thanksgiving week is
 * closed; Dec 24 is closed; Dec 26 is optional. Optional competition/training
 * sessions never reduce the season price.
 */
export function winterWrestlingRequiredPractices(
  schedule: WinterWrestlingSchedule,
): string[] {
  if (!WINTER_WRESTLING_SCHEDULES.includes(schedule)) {
    throw new Error("Select an approved Winter Wrestling training schedule.");
  }
  const weekdays = schedule === "monday-wednesday-saturday"
    ? new Set([1, 3, 6])
    : new Set([2, 4, 6]);
  const excluded = new Set(["2026-12-24", "2026-12-26"]);
  return isoDatesBetween(
    WINTER_WRESTLING_2026_27.requiredProgramStart,
    WINTER_WRESTLING_2026_27.seasonEnd,
  ).filter((date) => {
    if (excluded.has(date)) return false;
    return weekdays.has(new Date(`${date}T12:00:00Z`).getUTCDay());
  });
}

export function winterWrestlingProration(input: {
  athleteCount: number;
  enrollmentDate: string;
  schedule: WinterWrestlingSchedule;
}): {
  requiredPracticeCount: number;
  missedRequiredPracticeCount: number;
  perAthleteDiscountCents: number;
  totalDiscountCents: number;
  appliedPercent: number;
  requiresLateEnrollmentReview: boolean;
  enrollmentCutoffConfirmed: false;
} {
  const { athleteCount, enrollmentDate, schedule } = input;
  if (!Number.isInteger(athleteCount) || athleteCount < 1 || athleteCount > 5) {
    throw new Error("Winter Wrestling supports one to five athletes per proposal.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(enrollmentDate)) {
    throw new Error("Valid enrollment date required (YYYY-MM-DD).");
  }
  if (enrollmentDate > WINTER_WRESTLING_2026_27.seasonEnd) {
    throw new Error("Enrollment date falls after Winter Wrestling ends.");
  }
  const practices = winterWrestlingRequiredPractices(schedule);
  const missed = practices.filter((date) => date < enrollmentDate).length;
  const rawPercent = practices.length ? (missed / practices.length) * 100 : 0;
  const appliedPercent = Math.min(
    WINTER_WRESTLING_2026_27.maxProrationPercent,
    rawPercent,
  );
  const perAthleteDiscountCents = Math.round(
    WINTER_WRESTLING_2026_27.perAthleteCents * appliedPercent / 100,
  );
  return {
    requiredPracticeCount: practices.length,
    missedRequiredPracticeCount: missed,
    perAthleteDiscountCents,
    totalDiscountCents: perAthleteDiscountCents * athleteCount,
    appliedPercent: Number(appliedPercent.toFixed(2)),
    requiresLateEnrollmentReview:
      enrollmentDate > WINTER_WRESTLING_2026_27.seasonStart,
    // Product has not approved an enrollment cutoff. Keep that decision visible
    // and fail closed only after the published season end.
    enrollmentCutoffConfirmed: false,
  };
}

export function winterWrestlingPaymentPlan(
  athleteCount: number,
  payInFull = false,
): { totalCents: number; installmentsCents: number[] } {
  if (!Number.isInteger(athleteCount) || athleteCount < 1 || athleteCount > 5) {
    throw new Error("Athlete count outside approved winter season schedule; Management approval required.");
  }
  const totalCents = athleteCount * WINTER_WRESTLING_2026_27.perAthleteCents;
  const installmentsCents = payInFull
    ? [totalCents]
    : [...WINTER_WRESTLING_2026_27.paymentAmountsCents[athleteCount]];
  if (installmentsCents.reduce((a, b) => a + b, 0) !== totalCents) {
    throw new Error("Winter wrestling installment totals do not reconcile.");
  }
  return { totalCents, installmentsCents };
}

export type WinterSeasonInstallment = {
  number: number;
  amountCents: number;
  dueDate: string;
  stripePriceId: string | null;
};

/**
 * Builds an approval-ready schedule, not a charge authorization.
 * Later due dates must be strictly after the enrollment date.
 * The caller must obtain explicit guardian approval and persist a locked proposal
 * before creating a Checkout Session.
 */
export function buildWinterWrestlingSchedule(
  athleteCount: number,
  enrollmentDate: string,
  payInFull = false,
  trainingSchedule: WinterWrestlingSchedule = "monday-wednesday-saturday",
): {
  totalCents: number;
  installments: WinterSeasonInstallment[];
  requiresManualReview: boolean;
} {
  const enrollment = new Date(enrollmentDate + "T12:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(enrollmentDate) ||
    !Number.isFinite(enrollment.getTime()) ||
    enrollment.toISOString().slice(0, 10) !== enrollmentDate
  ) {
    throw new Error("Valid enrollment date required (YYYY-MM-DD).");
  }
  if (enrollmentDate > WINTER_WRESTLING_2026_27.seasonEnd) {
    throw new Error("Enrollment date falls after winter season ends.");
  }
  const plan = winterWrestlingPaymentPlan(athleteCount, payInFull);
  const proration = winterWrestlingProration({
    athleteCount,
    enrollmentDate,
    schedule: trainingSchedule,
  });
  const adjustedAmounts = [...plan.installmentsCents];
  adjustedAmounts[0] -= proration.totalDiscountCents;
  const laterDates = WINTER_WRESTLING_2026_27.laterDueDates;
  const expectedDates = [enrollmentDate, ...laterDates.slice(0, adjustedAmounts.length - 1)];
  // Never generate a backdated installment: require manual review to
  // agree a new due date rather than silently charge a family.
  const requiresManualReview = expectedDates.some((date, i) =>
    i > 0 && date <= enrollmentDate
  );
  const installments = adjustedAmounts.map((amountCents, index) => ({
    number: index + 1,
    amountCents,
    dueDate: expectedDates[index],
    stripePriceId:
      adjustedAmounts.length === 1 && proration.totalDiscountCents === 0
        ? WINTER_WRESTLING_2026_27.fullSeasonPriceId // Charge with quantity = athleteCount.
        : WINTER_WRESTLING_2026_27.installmentPricesCents[amountCents] || null,
  }));
  return {
    totalCents: plan.totalCents - proration.totalDiscountCents,
    installments,
    requiresManualReview:
      requiresManualReview || proration.requiresLateEnrollmentReview,
  };
}
