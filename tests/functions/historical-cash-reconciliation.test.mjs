import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const { summarizeHistoricalCash } = require(`${buildRoot}/billing/historicalCashReconciliation.js`);
const source = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function payment(id, month, amount, membership, enrollment, unapplied) {
  return {
    paymentId: id,
    amountCents: amount,
    membershipAmountCents: membership,
    enrollmentFeeAmountCents: enrollment,
    unappliedMembershipAmountCents: unapplied,
    membershipPeriodAllocations: [{
      period: month, paidCents: membership - unapplied,
      requiredCents: 8000, fullyPaid: membership - unapplied === 8000,
    }],
  };
}

test("historical $100 September and October produce two paid months, $10 fee balance, $20 surplus", () => {
  const result = summarizeHistoricalCash({
    priorPayments: [
      payment("sep", "2026-09", 10000, 10000, 0, 2000),
      payment("oct", "2026-10", 10000, 8000, 2000, 0),
    ],
    monthlyMembershipCents: 8000,
    enrollmentFeeCents: 3000,
  });
  assert.deepEqual(result.fullyPaidPeriods, ["2026-09", "2026-10"]);
  assert.deepEqual(result.partiallyPaidPeriods, []);
  assert.deepEqual(result.membershipPaidByPeriodCents, { "2026-09": 8000, "2026-10": 8000 });
  assert.equal(result.enrollmentPaidCents, 2000);
  assert.equal(result.enrollmentRemainingCents, 1000);
  assert.equal(result.unappliedMembershipCents, 2000);
  assert.equal(result.totalRecordedCents, 20000);
  assert.equal(result.requiresManagementReview, true);
  assert.deepEqual(result.issues, []);
});

test("partial monthly credit stays partial; no future charge is automatically authorized", () => {
  const result = summarizeHistoricalCash({
    priorPayments: [payment("p1", "2026-10", 5000, 5000, 0, 0)],
    monthlyMembershipCents: 8000,
    enrollmentFeeCents: 3000,
  });
  assert.deepEqual(result.fullyPaidPeriods, []);
  assert.deepEqual(result.partiallyPaidPeriods, ["2026-10"]);
  assert.equal(result.membershipPaidByPeriodCents["2026-10"], 5000);
  assert.equal(result.enrollmentRemainingCents, 3000);
});

test("duplicate payment IDs, overpaid periods, and imbalanced amounts are flagged, not concealed", () => {
  const result = summarizeHistoricalCash({
    priorPayments: [
      payment("same", "2026-09", 8000, 8000, 0, 0),
      payment("same", "2026-09", 8000, 8000, 0, 0),
      { ...payment("third", "2026-10", 9000, 8000, 0, 0) },
    ],
    monthlyMembershipCents: 8000,
    enrollmentFeeCents: 3000,
  });
  assert.ok(result.issues.some(x => x.includes("Duplicate payment reference")));
  assert.ok(result.issues.some(x => x.includes("exceeds the monthly rate")));
  assert.ok(result.issues.some(x => x.includes("does not balance")));
  assert.equal(result.requiresManagementReview, true);
});

test("missing legacy monthly allocation remains unresolved, never inferred", () => {
  const result = summarizeHistoricalCash({
    priorPayments: [{ paymentId: "legacy", amountCents: 10000, membershipAmountCents: 10000,
      enrollmentFeeAmountCents: 0, unappliedMembershipAmountCents: 0 }],
    monthlyMembershipCents: 8000, enrollmentFeeCents: 3000,
  });
  assert.deepEqual(result.fullyPaidPeriods, []);
  assert.ok(result.issues.some(x => x.includes("no auditable monthly allocation")));
});

test("fee over-allocation and invalid month format are surfaced", () => {
  const result = summarizeHistoricalCash({
    priorPayments: [payment("x", "2026-13", 9000, 8000, 1000, 0),
      payment("y", "2026-10", 11000, 8000, 3000, 0)],
    monthlyMembershipCents: 8000, enrollmentFeeCents: 3000,
  });
  assert.ok(result.issues.some(x => x.includes("Historical enrollment payments exceed")));
  assert.ok(result.issues.some(x => x.includes("invalid monthly allocation")));
  assert.equal(result.requiresManagementReview, true);
});

test("prior cash records an informational review and checkout requires reconciled signed terms", () => {
  const recording = source("functions/src/billing/recordProposalPriorPayment.ts");
  const checkout = source("functions/src/proposals/createProposalCheckout.ts");
  assert.match(recording, /const historicalCashReview = summarizeHistoricalCash/);
  assert.match(recording, /historicalCashReview,/);
  assert.match(checkout, /Array.isArray\(proposal.priorPayments\)/);
  assert.match(checkout, /resolveHistoricalCashCheckoutTerms\(proposal\)/);
  assert.match(checkout, /Stripe billing must match the family.s signed historical-cash terms exactly/);
  assert.match(checkout, /Historical cash schedule has expired/);
});
