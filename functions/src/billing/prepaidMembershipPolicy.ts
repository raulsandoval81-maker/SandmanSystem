export type FeeSelection = {
  athleteIndex: number;
  athleteName: string;
  included: boolean;
  amountCents: number;
};

export type FullYearPrepayment = {
  membershipAmountCents: number;
  membershipPaidInFull: true;
  annualEnrollmentFee: {
    totalCents: number;
    previouslyPaidCents: number;
    paidWithPrepaymentCents: number;
    paidCents: number;
    outstandingCents: number;
    selections: FeeSelection[];
  };
};

function whole(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }
  return result;
}

export function resolveFullYearPrepayment(input: {
  amountCents: unknown;
  membershipAmountCents: unknown;
  expectedMonthlyMembershipCents: number;
  enrollmentFeeTotalCents: number;
  enrollmentFeePreviouslyPaidCents: number;
  athletes: Array<{ name?: unknown; plan?: unknown }>;
  enrollmentFeeIncludedAthleteIndexes: unknown;
  enrollmentFeeAllocations?: unknown;
}): FullYearPrepayment {
  const amountCents = whole(input.amountCents, "amountCents");
  const membershipAmountCents = whole(
    input.membershipAmountCents,
    "membershipAmountCents"
  );
  const expectedMembershipCents = input.expectedMonthlyMembershipCents * 12;
  if (membershipAmountCents !== expectedMembershipCents) {
    throw new Error(
      `Twelve-month membership allocation must equal ${expectedMembershipCents} cents.`
    );
  }

  const eligible = input.athletes
    .map((athlete, index) => ({ athlete, athleteIndex: index + 1 }))
    .filter(({ athlete }) => String(athlete.plan || "standard") !== "fitness");
  if (!eligible.length) {
    throw new Error("At least one eligible athlete is required.");
  }
  if (input.enrollmentFeeTotalCents % eligible.length !== 0) {
    throw new Error("Annual enrollment fee does not divide cleanly by athlete.");
  }

  const included = Array.isArray(input.enrollmentFeeIncludedAthleteIndexes)
    ? new Set(input.enrollmentFeeIncludedAthleteIndexes.map(Number))
    : new Set<number>();
  const eligibleIndexes = new Set(eligible.map(({ athleteIndex }) => athleteIndex));
  if ([...included].some((index) => !Number.isInteger(index) || !eligibleIndexes.has(index))) {
    throw new Error("Annual enrollment fee selections contain an invalid athlete.");
  }

  const feePerAthleteCents = input.enrollmentFeeTotalCents / eligible.length;
  const explicitAllocations = new Map<number, number>();
  if (Array.isArray(input.enrollmentFeeAllocations)) {
    for (const raw of input.enrollmentFeeAllocations) {
      const entry = raw as Record<string, unknown>;
      const athleteIndex = Number(entry.athleteIndex);
      const amountCents = whole(entry.amountCents, "enrollment fee allocation");
      if (!eligibleIndexes.has(athleteIndex) || explicitAllocations.has(athleteIndex)) {
        throw new Error("Annual enrollment fee allocations contain an invalid athlete.");
      }
      if (amountCents > feePerAthleteCents) {
        throw new Error("An athlete enrollment-fee allocation exceeds that athlete's annual fee.");
      }
      explicitAllocations.set(athleteIndex, amountCents);
    }
  }
  const selections = eligible.map(({ athlete, athleteIndex }) => {
    const explicitAmount = explicitAllocations.get(athleteIndex);
    const amountCents = explicitAmount ?? (included.has(athleteIndex) ? feePerAthleteCents : 0);
    return {
      athleteIndex,
      athleteName: String(athlete.name || `Athlete ${athleteIndex}`).trim(),
      included: amountCents > 0,
      amountCents,
    };
  });
  const paidWithPrepaymentCents = selections.reduce(
    (total, selection) => total + selection.amountCents,
    0
  );
  const remainingBeforePayment = Math.max(
    0,
    input.enrollmentFeeTotalCents - input.enrollmentFeePreviouslyPaidCents
  );
  if (paidWithPrepaymentCents > remainingBeforePayment) {
    throw new Error(
      "Selected annual enrollment fees exceed the remaining enrollment-fee balance."
    );
  }
  if (amountCents !== membershipAmountCents + paidWithPrepaymentCents) {
    throw new Error(
      "Payment received must equal the exact membership and annual-fee allocation."
    );
  }

  const paidCents = input.enrollmentFeePreviouslyPaidCents + paidWithPrepaymentCents;
  return {
    membershipAmountCents,
    membershipPaidInFull: true,
    annualEnrollmentFee: {
      totalCents: input.enrollmentFeeTotalCents,
      previouslyPaidCents: input.enrollmentFeePreviouslyPaidCents,
      paidWithPrepaymentCents,
      paidCents,
      outstandingCents: Math.max(0, input.enrollmentFeeTotalCents - paidCents),
      selections,
    },
  };
}

export function validateFullYearCoverage(
  startDate: string,
  paidThroughDate: string,
  nextBillingDate: string
): void {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Dates must use YYYY-MM-DD.");
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) throw new Error("A prepaid membership date is invalid.");
    return date;
  };
  const start = parse(startDate);
  const paidThrough = parse(paidThroughDate);
  const nextBilling = parse(nextBillingDate);
  const expectedPaidThrough = new Date(start);
  expectedPaidThrough.setUTCFullYear(expectedPaidThrough.getUTCFullYear() + 1);
  expectedPaidThrough.setUTCDate(expectedPaidThrough.getUTCDate() - 1);

  if (paidThrough.getTime() !== expectedPaidThrough.getTime()) {
    throw new Error("Paid-through date must cover exactly twelve months of membership.");
  }
  if (nextBilling.getTime() <= paidThrough.getTime()) {
    throw new Error("Recurring billing must begin after the prepaid paid-through date.");
  }
}
