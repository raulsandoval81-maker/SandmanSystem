const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveFullYearPrepayment,
  validateFullYearCoverage,
} = require("../lib/billing/prepaidMembershipPolicy.js");

const athletes = [
  { name: "Athlete One", plan: "standard" },
  { name: "Athlete Two", plan: "standard" },
];

test("paid in full requires the complete twelve-month membership allocation", () => {
  assert.throws(() => resolveFullYearPrepayment({
    amountCents: 966000,
    membershipAmountCents: 960000,
    expectedMonthlyMembershipCents: 81000,
    enrollmentFeeTotalCents: 6000,
    enrollmentFeePreviouslyPaidCents: 0,
    athletes,
    enrollmentFeeIncludedAthleteIndexes: [1, 2],
  }), /must equal 972000 cents/);
});

test("annual enrollment selections stay per-athlete and separate", () => {
  const result = resolveFullYearPrepayment({
    amountCents: 975000,
    membershipAmountCents: 972000,
    expectedMonthlyMembershipCents: 81000,
    enrollmentFeeTotalCents: 6000,
    enrollmentFeePreviouslyPaidCents: 0,
    athletes,
    enrollmentFeeIncludedAthleteIndexes: [2],
  });
  assert.equal(result.membershipPaidInFull, true);
  assert.equal(result.membershipAmountCents, 972000);
  assert.equal(result.annualEnrollmentFee.paidWithPrepaymentCents, 3000);
  assert.equal(result.annualEnrollmentFee.outstandingCents, 3000);
  assert.deepEqual(
    result.annualEnrollmentFee.selections.map((entry) => entry.included),
    [false, true]
  );
});

test("payment received must reconcile exactly to membership plus selected fees", () => {
  assert.throws(() => resolveFullYearPrepayment({
    amountCents: 976000,
    membershipAmountCents: 972000,
    expectedMonthlyMembershipCents: 81000,
    enrollmentFeeTotalCents: 6000,
    enrollmentFeePreviouslyPaidCents: 0,
    athletes,
    enrollmentFeeIncludedAthleteIndexes: [2],
  }), /must equal the exact membership and annual-fee allocation/);
});

test("an athlete fee selection can allocate only the remaining partial balance", () => {
  const result = resolveFullYearPrepayment({
    amountCents: 973000,
    membershipAmountCents: 972000,
    expectedMonthlyMembershipCents: 81000,
    enrollmentFeeTotalCents: 3000,
    enrollmentFeePreviouslyPaidCents: 2000,
    athletes: [athletes[0]],
    enrollmentFeeIncludedAthleteIndexes: [1],
    enrollmentFeeAllocations: [{ athleteIndex: 1, amountCents: 1000 }],
  });
  assert.equal(result.annualEnrollmentFee.paidWithPrepaymentCents, 1000);
  assert.equal(result.annualEnrollmentFee.outstandingCents, 0);
});

test("coverage is exactly twelve months and Stripe begins afterward", () => {
  assert.doesNotThrow(() => validateFullYearCoverage(
    "2026-11-05",
    "2027-11-04",
    "2027-11-05"
  ));
  assert.throws(() => validateFullYearCoverage(
    "2026-11-05",
    "2027-11-04",
    "2027-11-04"
  ), /must begin after/);
});
