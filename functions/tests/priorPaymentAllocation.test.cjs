const test = require("node:test");
const assert = require("node:assert/strict");

const {
  allocatePriorPayment,
  enrollmentFeePaidCents,
} = require("../lib/billing/priorPaymentAllocation.js");

test("allocates October cash as $80 membership and $20 enrollment", () => {
  assert.deepEqual(
    allocatePriorPayment({
      amountCents: 10000,
      requestedEnrollmentFeeAmountCents: 2000,
      legacyEnrollmentFeeIncluded: false,
      enrollmentFeeCents: 3000,
      enrollmentFeeAlreadyPaidCents: 0,
    }),
    {
      membershipAmountCents: 8000,
      enrollmentFeeAmountCents: 2000,
      enrollmentFeeIncluded: false,
    }
  );
});

test("leaves $10 outstanding and marks enrollment complete only after it is paid", () => {
  const first = allocatePriorPayment({
    amountCents: 10000,
    requestedEnrollmentFeeAmountCents: 2000,
    legacyEnrollmentFeeIncluded: false,
    enrollmentFeeCents: 3000,
    enrollmentFeeAlreadyPaidCents: 0,
  });
  assert.equal(first.enrollmentFeeIncluded, false);

  const final = allocatePriorPayment({
    amountCents: 1000,
    requestedEnrollmentFeeAmountCents: 1000,
    legacyEnrollmentFeeIncluded: false,
    enrollmentFeeCents: 3000,
    enrollmentFeeAlreadyPaidCents: first.enrollmentFeeAmountCents,
  });
  assert.equal(final.enrollmentFeeIncluded, true);
  assert.equal(final.membershipAmountCents, 0);
});

test("preserves legacy full-fee checkbox records", () => {
  assert.equal(
    enrollmentFeePaidCents({ enrollmentFeeIncluded: true }, 3000),
    3000
  );
  assert.deepEqual(
    allocatePriorPayment({
      amountCents: 10000,
      requestedEnrollmentFeeAmountCents: undefined,
      legacyEnrollmentFeeIncluded: true,
      enrollmentFeeCents: 3000,
      enrollmentFeeAlreadyPaidCents: 0,
    }),
    {
      membershipAmountCents: 7000,
      enrollmentFeeAmountCents: 3000,
      enrollmentFeeIncluded: true,
    }
  );
});

test("rejects allocations beyond the payment or remaining enrollment fee", () => {
  assert.throws(() => allocatePriorPayment({
    amountCents: 1000,
    requestedEnrollmentFeeAmountCents: 2000,
    legacyEnrollmentFeeIncluded: false,
    enrollmentFeeCents: 3000,
    enrollmentFeeAlreadyPaidCents: 0,
  }), /cannot exceed the payment amount/);

  assert.throws(() => allocatePriorPayment({
    amountCents: 10000,
    requestedEnrollmentFeeAmountCents: 2000,
    legacyEnrollmentFeeIncluded: false,
    enrollmentFeeCents: 3000,
    enrollmentFeeAlreadyPaidCents: 2000,
  }), /cannot exceed the remaining annual enrollment fee/);
});
