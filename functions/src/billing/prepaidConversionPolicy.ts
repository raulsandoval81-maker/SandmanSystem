// Audited carry-forward for a separately accepted prepaid agreement.
// A prior payment never becomes a payment against the new agreement.
function clean(value: unknown): string {
  return String(value ?? "").trim();
}

const normal = (value: unknown): string => clean(value).toLowerCase();

export function verifyPrepaidConversionSource(input: {
  sourceProposalId: string;
  source: Record<string, any>;
  target: Record<string, any>;
  newMembershipStartDate: string;
}): {
  sourceProposalId: string;
  historicalMembershipCents: number;
  historicalEnrollmentCents: number;
  historicalMembershipPeriods: string[];
} {
  const { sourceProposalId, source, target, newMembershipStartDate } = input;
  if (!/^[-A-Za-z0-9]{1,80}$/.test(sourceProposalId) ||
      sourceProposalId === clean(target.proposalId)) {
    throw new Error("A different, valid prior proposal ID is required.");
  }
  if (!source || clean(source.locationId) !== clean(target.locationId)) {
    throw new Error("The prior agreement must exist in the same location.");
  }
  const sourceEmail = normal(
    source.lockedSnapshot?.prospect?.parentEmail ||
    source.prospect?.parentEmail
  );
  const targetEmail = normal(
    target.lockedSnapshot?.prospect?.parentEmail ||
    target.prospect?.parentEmail
  );
  if (!sourceEmail || !targetEmail || sourceEmail !== targetEmail) {
    throw new Error("The prior and new agreement must have the same verified guardian email.");
  }
  const athleteNames = (proposal: Record<string, any>): string[] =>
    (Array.isArray(proposal.lockedSnapshot?.athletes)
      ? proposal.lockedSnapshot.athletes
      : Array.isArray(proposal.athletes) ? proposal.athletes : [])
      .map((athlete: any) => normal(athlete?.name))
      .filter(Boolean).sort();
  const oldAthletes = athleteNames(source);
  const newAthletes = athleteNames(target);
  if (!oldAthletes.length || JSON.stringify(oldAthletes) !== JSON.stringify(newAthletes)) {
    throw new Error("The prior and new agreement must cover the same athletes.");
  }

  const historical = Array.isArray(source.priorPayments) ? source.priorPayments : [];
  const historicalMembershipCents = historical.reduce(
    (sum: number, item: any) => sum + Math.max(0, Number(item?.membershipAmountCents) || 0), 0
  );
  const historicalEnrollmentCents = historical.reduce(
    (sum: number, item: any) => sum + Math.max(0, Number(item?.enrollmentFeeAmountCents) || 0), 0
  );
  const historicalMembershipPeriods = [...new Set(
    historical.flatMap((item: any) => Array.isArray(item?.periods) ? item.periods : [])
      .filter((period: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(clean(period)))
      .map(String)
  )].sort();
  if (!Number.isSafeInteger(historicalMembershipCents) ||
      !Number.isSafeInteger(historicalEnrollmentCents) ||
      historicalMembershipCents <= 0 ||
      historicalEnrollmentCents <= 0 ||
      !historicalMembershipPeriods.length) {
    throw new Error("Verified prior membership and enrollment payments are required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newMembershipStartDate) ||
      historicalMembershipPeriods.some((period) => period >= newMembershipStartDate.slice(0, 7))) {
    throw new Error("Previous membership periods must precede the new prepaid term.");
  }
  const creditedEnrollmentCents = Math.round(
    Number(target.pricing?.enrollmentPreviouslyPaidAmount || 0) * 100
  );
  const feeTotalCents = Math.round(Number(
    target.lockedSnapshot?.pricing?.enrollmentBase ??
    target.pricing?.enrollmentBase ?? 0
  ) * 100);
  if (creditedEnrollmentCents !== historicalEnrollmentCents ||
      creditedEnrollmentCents > feeTotalCents) {
    throw new Error("The accepted new agreement must match the prior verified enrollment-fee credit.");
  }
  return {
    sourceProposalId,
    historicalMembershipCents,
    historicalEnrollmentCents,
    historicalMembershipPeriods,
  };
}
