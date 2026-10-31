import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { resolveHistoricalCashCheckoutTerms } =
  require("../../functions/lib/billing/historicalCashCheckoutTerms.js");
const { validateHistoricalCashDisposition } =
  require("../../functions/lib/billing/historicalCashDisposition.js");
const { buildClientProposalSnapshot } =
  require("../../functions/lib/proposals/proposalClientReview.js");
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const payments = [
  { paymentId: "sept", amountCents: 10000,
    membershipAmountCents: 10000, enrollmentFeeAmountCents: 0,
    unappliedMembershipAmountCents: 2000,
    membershipPeriodAllocations: [{ period: "2026-09", paidCents: 8000 }] },
  { paymentId: "oct", amountCents: 10000,
    membershipAmountCents: 8000, enrollmentFeeAmountCents: 2000,
    unappliedMembershipAmountCents: 0,
    membershipPeriodAllocations: [{ period: "2026-10", paidCents: 8000 }] },
];
const pricing = {
  monthlyBalance: 80, enrollmentBase: 30,
  membershipStartDate: "2026-09-01",
  firstRecurringChargeDate: "2026-11-05",
  recurringBillingDay: 5, dueNow: 90, enrollmentDueNow: 10,
  proratedFirstMonth: 80, additionalMembershipMonthsDue: 0,
};
const held = validateHistoricalCashDisposition({
  priorPayments: payments, monthlyMembershipCents: 8000,
  enrollmentFeeCents: 3000, kind: "hold_unapplied", amountCents: 2000,
});
const proposal = {
  pricing, priorPayments: payments,
  historicalCashDisposition: { status: "recorded", kind: "hold_unapplied",
    amountCents: 2000, targetPeriod: null, ledgerFingerprint: held.ledgerFingerprint }
};

test("paid September and October: $10 enrollment now, $80 recurring November 5, $20 stays held", () => {
  const t = resolveHistoricalCashCheckoutTerms(proposal);
  assert.equal(t.dueNowCents, 1000);
  assert.equal(t.enrollmentRemainingCents, 1000);
  assert.equal(t.monthlyMembershipCents, 8000);
  assert.equal(t.firstRecurringChargeDate, "2026-11-05");
  assert.equal(t.unappliedCashHeldCents, 2000);
  const signed = buildClientProposalSnapshot("P-000019", proposal);
  assert.deepEqual(signed.historicalCashCheckoutTerms, t);
  assert.equal(signed.pricing.dueNow, 10);
  assert.equal(signed.pricing.enrollmentDueNow, 10);
  assert.equal(signed.pricing.proratedFirstMonth, 0);
  assert.equal(signed.pricing.additionalMembershipMonthsDue, 0);
  assert.equal(signed.pricing.monthlyBalance, 80);
});

test("unsigned credit proposal, refund pending and absent surplus decision remain blocked", () => {
  for (const kind of ["future_month_credit_pending", "refund_pending"]) {
    const changed = { ...proposal, historicalCashDisposition: { ...proposal.historicalCashDisposition, kind } };
    assert.throws(() => resolveHistoricalCashCheckoutTerms(changed), /explicit hold/);
  }
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, historicalCashDisposition: undefined
  }), /explicit hold/);
});

test("covered November, skipped month and partial month cannot enter Stripe", () => {
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, pricing: { ...pricing, firstRecurringChargeDate: "2026-10-05" }
  }), /immediately after paid coverage/);
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, priorPayments: [payments[0], {
      ...payments[1], membershipPeriodAllocations: [{period:"2026-11", paidCents:8000}]
    }]
  }), /continuous paid coverage/);
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, priorPayments: [payments[0], {
      ...payments[1], membershipPeriodAllocations: [{period:"2026-10", paidCents:4000}],
      unappliedMembershipAmountCents:4000,
    }]
  }), /partially paid/);
});

test("incorrect membership start or no-charge setup cannot enter payment Checkout", () => {
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, pricing: { ...pricing, membershipStartDate: "2026-10-01" }
  }), /Membership start/);
  assert.throws(() => resolveHistoricalCashCheckoutTerms({
    ...proposal, pricing: { ...pricing, enrollmentBase: 20 }
  }), /no-charge first payment|annual fee|no unapplied|mismatch|exceed/);
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
