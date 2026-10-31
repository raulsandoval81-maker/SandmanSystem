import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { previewHistoricalCashPaymentPlan } = require("../../functions/lib/billing/historicalCashPaymentPlan.js");
const source = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function prior(id, period, amountCents, feeCents, unappliedCents, paidCents) {
  return {
    paymentId: id, amountCents,
    membershipAmountCents: amountCents - feeCents,
    enrollmentFeeAmountCents: feeCents,
    unappliedMembershipAmountCents: unappliedCents,
    membershipPeriodAllocations: [
      { period, paidCents },
    ],
  };
}

test("Felipe example: September/October covered; Nov 5 remains proposed, with $20 unallocated and $10 fee", () => {
  const plan = previewHistoricalCashPaymentPlan({
    priorPayments: [
      prior("sep", "2026-09", 10000, 0, 2000, 8000),
      prior("oct", "2026-10", 10000, 2000, 0, 8000),
    ],
    monthlyMembershipCents: 8000,
    enrollmentFeeCents: 3000,
    chargeDate: "2026-11-05",
  });
  assert.deepEqual(plan.review.fullyPaidPeriods, ["2026-09", "2026-10"]);
  assert.equal(plan.chargeDate, "2026-11-05");
  assert.equal(plan.period, "2026-11");
  assert.equal(plan.periodAlreadyPaidCents, 0);
  assert.equal(plan.periodOutstandingCents, 8000);
  assert.equal(plan.enrollmentRemainingCents, 1000);
  assert.equal(plan.unappliedMembershipCents, 2000);
  assert.equal(plan.totalOutstandingBeforeUnappliedDecisionCents, 9000);
  assert.equal(plan.readyForCheckout, false);
  assert.ok(plan.blockers.some(x => x.includes("explicit Management disposition")));
});

test("already-covered scheduled month is not charged again by plan", () => {
  const plan = previewHistoricalCashPaymentPlan({
    priorPayments: [prior("nov", "2026-11", 8000, 0, 0, 8000)],
    monthlyMembershipCents: 8000,
    enrollmentFeeCents: 3000,
    chargeDate: "2026-11-05",
  });
  assert.equal(plan.periodAlreadyPaidCents, 8000);
  assert.equal(plan.periodOutstandingCents, 0);
  assert.ok(plan.blockers.some(x => x.includes("already has cash coverage")));
  assert.equal(plan.readyForCheckout, false);
});

test("partially paid charge month stays partial and blocks auto-charge", () => {
  const plan = previewHistoricalCashPaymentPlan({
    priorPayments: [prior("part", "2026-11", 4000, 0, 0, 4000)],
    monthlyMembershipCents: 8000,
    enrollmentFeeCents: 3000,
    chargeDate: "2026-11-05",
  });
  assert.equal(plan.periodAlreadyPaidCents, 4000);
  assert.equal(plan.periodOutstandingCents, 4000);
  assert.equal(plan.readyForCheckout, false);
});

test("invalid fifth of month schedule cannot produce a preview", () => {
  for (const chargeDate of ["2026-11-06", "2026-00-05", "2026-13-05", "garbage"]) {
    assert.throws(() => previewHistoricalCashPaymentPlan({
      priorPayments: [], monthlyMembershipCents: 8000,
      enrollmentFeeCents: 3000, chargeDate,
    }));
  }
});

test("cash recording returns proposed payment schedule but Stripe checkout remains gated", () => {
  const recording = source("functions/src/billing/recordProposalPriorPayment.ts");
  const management = source("public/management/billing/billing.js");
  const checkout = source("functions/src/proposals/createProposalCheckout.ts");
  assert.match(recording, /historicalCashPaymentPlan,/);
  assert.match(management, /recorded\?\.data\?\.historicalCashPaymentPlan/);
  assert.match(management, /Proposed Stripe date:/);
  assert.match(checkout, /Array.isArray\(proposal.priorPayments\)/);
});
