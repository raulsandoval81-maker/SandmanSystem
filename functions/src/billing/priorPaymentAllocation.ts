export type PriorPaymentAllocation = {
  enrollmentFeeAmountCents: number;
  membershipAmountCents: number;
  enrollmentFeeIncluded: boolean;
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
