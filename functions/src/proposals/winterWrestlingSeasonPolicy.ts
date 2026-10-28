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
} as const;

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
  const laterDates = WINTER_WRESTLING_2026_27.laterDueDates;
  const expectedDates = [enrollmentDate, ...laterDates.slice(0, plan.installmentsCents.length - 1)];
  // Never generate a backdated installment: require manual review to
  // agree a new due date rather than silently charge a family.
  const requiresManualReview = expectedDates.some((date, i) =>
    i > 0 && date <= enrollmentDate
  );
  const installments = plan.installmentsCents.map((amountCents, index) => ({
    number: index + 1,
    amountCents,
    dueDate: expectedDates[index],
    stripePriceId:
      plan.installmentsCents.length === 1
        ? WINTER_WRESTLING_2026_27.fullSeasonPriceId // Charge with quantity = athleteCount.
        : WINTER_WRESTLING_2026_27.installmentPricesCents[amountCents] || null,
  }));
  return { totalCents: plan.totalCents, installments, requiresManualReview };
}
