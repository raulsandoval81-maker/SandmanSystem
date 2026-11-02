import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { resolveHistoricalCashCheckoutTerms } =
  require("../../functions/lib/billing/historicalCashCheckoutTerms.js");
const { buildClientProposalSnapshot } =
  require("../../functions/lib/proposals/proposalClientReview.js");
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const payments = [
  { paymentId: "sept", amountCents: 10000,
    membershipAmountCents: 10000, enrollmentFeeAmountCents: 0,
    unappliedMembershipAmountCents: 0, historicalMonthlyRateCents: 10000,
    membershipPeriodAllocations: [{ period: "2026-09", paidCents: 10000, requiredCents: 10000 }] },
  { paymentId: "oct", amountCents: 10000,
    membershipAmountCents: 8000, enrollmentFeeAmountCents: 2000,
    unappliedMembershipAmountCents: 0, historicalMonthlyRateCents: 8000,
    membershipPeriodAllocations: [{ period: "2026-10", paidCents: 8000, requiredCents: 8000 }] },
];
const pricing = {
  monthlyBalance: 80, enrollmentBase: 30,
  membershipStartDate: "2026-10-05",
  firstRecurringChargeDate: "2026-11-05",
  recurringBillingDay: 5, dueNow: 90, enrollmentDueNow: 10,
  proratedFirstMonth: 80, additionalMembershipMonthsDue: 0,
};
const proposal = {
  pricing, priorPayments: payments,
};

test("September month-to-month and paid October agreement start: $10 now, $80 November 5", () => {
  const t = resolveHistoricalCashCheckoutTerms(proposal);
  assert.equal(t.dueNowCents, 1000);
  assert.equal(t.enrollmentRemainingCents, 1000);
  assert.equal(t.monthlyMembershipCents, 8000);
  assert.equal(t.firstRecurringChargeDate, "2026-11-05");
  assert.equal(t.unappliedCashHeldCents, 0);
  const signed = buildClientProposalSnapshot("P-000019", proposal);
  assert.deepEqual(signed.historicalCashCheckoutTerms, t);
  assert.equal(signed.pricing.dueNow, 10);
  assert.equal(signed.pricing.enrollmentDueNow, 10);
  assert.equal(signed.pricing.proratedFirstMonth, 0);
  assert.equal(signed.pricing.additionalMembershipMonthsDue, 0);
  assert.equal(signed.pricing.monthlyBalance, 80);
});

test("a disposition without unapplied cash remains blocked", () => {
  for (const kind of ["future_month_credit_pending", "refund_pending"]) {
    const changed = { ...proposal, historicalCashDisposition: { status: "recorded", kind } };
    assert.throws(() => resolveHistoricalCashCheckoutTerms(changed), /without unapplied cash/);
  }
});

test("covered November, skipped month and partial month cannot enter Stripe", () => {
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, pricing: { ...pricing, firstRecurringChargeDate: "2026-10-05" }
  }), /immediately after paid coverage/);
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, priorPayments: [payments[0], {
      ...payments[1], membershipPeriodAllocations: [{period:"2026-11", paidCents:8000, requiredCents:8000}]
    }]
  }), /continuous paid coverage|inconsistent/);
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, priorPayments: [payments[0], {
      ...payments[1], membershipPeriodAllocations: [{period:"2026-10", paidCents:4000}],
      unappliedMembershipAmountCents:4000,
    }]
  }), /partially paid/);
});

test("agreement-start month must be paid, while earlier month-to-month history is allowed", () => {
  assert.equal(resolveHistoricalCashCheckoutTerms(proposal).dueNowCents, 1000);
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, pricing: { ...pricing, membershipStartDate: "2026-08-05" }
  }), /agreement-start month must be fully paid/i);
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, pricing: { ...pricing, membershipStartDate: "2026-11-05" }
  }), /agreement-start month must be fully paid/i);
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, pricing: { ...pricing, enrollmentBase: 20 }
  }), /no-charge first payment|annual fee|no unapplied|mismatch|exceed/);
});

test("other families can transition from separate paid history into a paid agreement-start month", () => {
  const otherFamily = {
    pricing: {
      monthlyBalance: 90, enrollmentBase: 40,
      membershipStartDate: "2027-02-05", firstRecurringChargeDate: "2027-03-05",
    },
    priorPayments: [
      { paymentId: "jan", amountCents: 7500, membershipAmountCents: 7500,
        enrollmentFeeAmountCents: 0, unappliedMembershipAmountCents: 0,
        historicalMonthlyRateCents: 7500,
        membershipPeriodAllocations: [{ period: "2027-01", paidCents: 7500, requiredCents: 7500 }] },
      { paymentId: "feb", amountCents: 12000, membershipAmountCents: 9000,
        enrollmentFeeAmountCents: 3000, unappliedMembershipAmountCents: 0,
        historicalMonthlyRateCents: 9000,
        membershipPeriodAllocations: [{ period: "2027-02", paidCents: 9000, requiredCents: 9000 }] },
    ],
  };
  const terms = resolveHistoricalCashCheckoutTerms(otherFamily);
  assert.equal(terms.dueNowCents, 1000);
  assert.equal(terms.monthlyMembershipCents, 9000);
  assert.equal(terms.firstRecurringChargeDate, "2027-03-05");
});

test("checkout and webhook verify signed terms and Stripe paid amount", () => {
  const checkout = read("functions/src/proposals/createProposalCheckout.ts");
  const webhook = read("functions/src/billing/webhook.ts");
  const acceptance = read("functions/src/proposals/acceptProposalClientReview.ts");
  const review = read("public/connect/proposals/review/review.js");
  assert.match(checkout, /resolveHistoricalCashCheckoutTerms\(proposal\)/);
  assert.match(checkout, /JSON.stringify\(proposal.clientAcceptance.signedSnapshot\) !== JSON.stringify\(snapshot\)/);
  assert.match(checkout, /Historical cash schedule has expired/);
  assert.match(checkout, /historicalCashDueNowCents/);
  assert.match(webhook, /session.amount_total !== expected.dueNowCents/);
  assert.match(webhook, /historicalCashLedgerFingerprint/);
  assert.match(webhook, /firstRecurringChargeDate\) !== expected.firstRecurringChargeDate/);
  assert.match(acceptance, /review.snapshot.historicalCashCheckoutTerms/);
  assert.match(review, /After you sign, secure checkout collects/);
});
