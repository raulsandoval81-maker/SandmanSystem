export type PriorPaymentAllocation = {
  enrollmentFeeAmountCents: number;
  membershipAmountCents: number;
  enrollmentFeeIncluded: boolean;
};

export type HistoricalEnrollmentFeeAttribution = {
  sourcePaymentReference: string;
  athleteIndex: number;
  amountCents: number;
};

function wholeNonNegative(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function enrollmentFeePaidCents(
  payment: Record<string, unknown>,
  enrollmentFeeCents: number
): number {
  const explicit = wholeNonNegative(payment.enrollmentFeeAmountCents);
  if (explicit !== null) return Math.min(explicit, enrollmentFeeCents);
  return payment.enrollmentFeeIncluded === true ? enrollmentFeeCents : 0;
}

export function priorPaymentReference(
  payment: Record<string, unknown>,
  index: number
): string {
  const explicit = String(payment.paymentId || "").trim();
  return explicit || `priorPayments/${index}`;
}

export function resolveHistoricalEnrollmentFeeAttributions(input: {
  priorPayments: Array<Record<string, unknown>>;
  enrollmentFeeCents: number;
  eligibleAthleteIndexes: number[];
  requestedAttributions: unknown;
}): HistoricalEnrollmentFeeAttribution[] {
  let remainingFeeCents = input.enrollmentFeeCents;
  const sources = input.priorPayments
    .map((payment, index) => {
      const amountCents = Math.min(
        remainingFeeCents,
        enrollmentFeePaidCents(payment, input.enrollmentFeeCents)
      );
      remainingFeeCents -= amountCents;
      return {
        sourcePaymentReference: priorPaymentReference(payment, index),
        amountCents,
      };
    })
    .filter((source) => source.amountCents > 0);

  if (!sources.length) return [];
  if (!input.eligibleAthleteIndexes.length) {
    throw new Error("Historical enrollment fees require an eligible athlete.");
  }

  const requested = Array.isArray(input.requestedAttributions)
    ? input.requestedAttributions
    : [];
  if (input.eligibleAthleteIndexes.length > 1 && !requested.length) {
    throw new Error(
      "Management must attribute historical enrollment-fee payments to specific athletes."
    );
  }

  const rawAttributions = requested.length
    ? requested
    : sources.map((source) => ({
      ...source,
      athleteIndex: input.eligibleAthleteIndexes[0],
    }));
  const sourceAmounts = new Map(
    sources.map((source) => [source.sourcePaymentReference, source.amountCents])
  );
  const eligibleIndexes = new Set(input.eligibleAthleteIndexes);
  const attributions = rawAttributions.map((raw) => {
    const entry = raw as Record<string, unknown>;
    const sourcePaymentReference = String(entry.sourcePaymentReference || "").trim();
    const athleteIndex = Number(entry.athleteIndex);
    const amountCents = wholeNonNegative(entry.amountCents);
    if (!sourceAmounts.has(sourcePaymentReference)) {
      throw new Error("An enrollment-fee attribution references an unknown payment.");
    }
    if (!Number.isInteger(athleteIndex) || !eligibleIndexes.has(athleteIndex)) {
      throw new Error("An enrollment-fee attribution references an invalid athlete.");
    }
    if (amountCents === null || amountCents <= 0) {
      throw new Error("Enrollment-fee attribution amounts must be positive whole numbers.");
    }
    return { sourcePaymentReference, athleteIndex, amountCents };
  });

  for (const [sourcePaymentReference, expectedCents] of sourceAmounts) {
    const attributedCents = attributions
      .filter((entry) => entry.sourcePaymentReference === sourcePaymentReference)
      .reduce((total, entry) => total + entry.amountCents, 0);
    if (attributedCents !== expectedCents) {
      throw new Error(
        `Historical enrollment-fee attribution for ${sourcePaymentReference} must equal ${expectedCents} cents.`
      );
    }
  }

  return attributions;
}

export function allocatePriorPayment(input: {
  amountCents: number;
  requestedEnrollmentFeeAmountCents: unknown;
  legacyEnrollmentFeeIncluded: boolean;
  enrollmentFeeCents: number;
  enrollmentFeeAlreadyPaidCents: number;
}): PriorPaymentAllocation {
  const remainingEnrollmentFeeCents = Math.max(
    0,
    input.enrollmentFeeCents - input.enrollmentFeeAlreadyPaidCents
  );
  const hasExplicitAllocation =
    input.requestedEnrollmentFeeAmountCents !== undefined &&
    input.requestedEnrollmentFeeAmountCents !== null &&
    input.requestedEnrollmentFeeAmountCents !== "";
  const requested = hasExplicitAllocation
    ? wholeNonNegative(input.requestedEnrollmentFeeAmountCents)
    : input.legacyEnrollmentFeeIncluded
      ? remainingEnrollmentFeeCents
      : 0;

  if (requested === null) {
    throw new Error("enrollmentFeeAmountCents must be a non-negative whole number.");
  }
  if (requested > input.amountCents) {
    throw new Error("Enrollment-fee allocation cannot exceed the payment amount.");
  }
  if (requested > remainingEnrollmentFeeCents) {
    throw new Error("Enrollment-fee allocation cannot exceed the remaining annual enrollment fee.");
  }

  const totalEnrollmentPaid = input.enrollmentFeeAlreadyPaidCents + requested;
  return {
    enrollmentFeeAmountCents: requested,
    membershipAmountCents: input.amountCents - requested,
    enrollmentFeeIncluded:
      input.enrollmentFeeCents > 0 &&
      totalEnrollmentPaid >= input.enrollmentFeeCents,
  };
}
