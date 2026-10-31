import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { validateHistoricalCashDisposition } = require("../../functions/lib/billing/historicalCashDisposition.js");
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const payments = [
  { paymentId: "sep", amountCents: 10000, membershipAmountCents: 10000,
    enrollmentFeeAmountCents: 0, unappliedMembershipAmountCents: 2000,
    membershipPeriodAllocations: [{ period: "2026-09", paidCents: 8000 }] },
  { paymentId: "oct", amountCents: 10000, membershipAmountCents: 8000,
    enrollmentFeeAmountCents: 2000, unappliedMembershipAmountCents: 0,
    membershipPeriodAllocations: [{ period: "2026-10", paidCents: 8000 }] },
];
const input = { priorPayments: payments, monthlyMembershipCents: 8000,
  enrollmentFeeCents: 3000, amountCents: 2000 };

test("Management can explicitly hold the $20 surplus without applying cash", () => {
  const x = validateHistoricalCashDisposition({ ...input, kind: "hold_unapplied" });
  assert.equal(x.amountCents, 2000);
  assert.equal(x.targetPeriod, null);
  assert.equal(x.review.enrollmentRemainingCents, 1000);
  assert.deepEqual(x.review.fullyPaidPeriods, ["2026-09", "2026-10"]);
  assert.match(x.ledgerFingerprint, /^[a-f0-9]{64}$/);
});

test("a future-month credit is a pending proposal, not a posted payment", () => {
  const x = validateHistoricalCashDisposition({ ...input,
    kind: "future_month_credit_pending", targetPeriod: "2026-11" });
  assert.equal(x.targetPeriod, "2026-11");
  assert.equal(x.review.unappliedMembershipCents, 2000);
});

test("pending refund requires a decision but never claims funds moved", () => {
  const x = validateHistoricalCashDisposition({ ...input, kind: "refund_pending" });
  assert.equal(x.kind, "refund_pending");
  assert.equal(x.amountCents, 2000);
});

test("cannot silently resolve only part of surplus or overfill covered period", () => {
  assert.throws(() => validateHistoricalCashDisposition({ ...input,
    kind: "hold_unapplied", amountCents: 1000 }), /entire unapplied cash/);
  assert.throws(() => validateHistoricalCashDisposition({ ...input,
    kind: "future_month_credit_pending", targetPeriod: "2026-10" }), /exceed|after existing/);
  assert.throws(() => validateHistoricalCashDisposition({ ...input,
    kind: "future_month_credit_pending", targetPeriod: "2026-13" }), /YYYY-MM/);
  assert.throws(() => validateHistoricalCashDisposition({ ...input,
    kind: "apply_to_enrollment" }), /unsupported/);
});

test("invalid ledger or no surplus cannot be dispositioned", () => {
  assert.throws(() => validateHistoricalCashDisposition({
    ...input, priorPayments: [{ ...payments[0], amountCents: 11000 }],
    kind: "hold_unapplied" }), /inconsistencies/);
  assert.throws(() => validateHistoricalCashDisposition({
    ...input, priorPayments: [payments[1]], kind: "hold_unapplied" }), /no unapplied/);
});

test("callable requires Management, Draft, history and makes no Stripe transfers", () => {
  const api = read("functions/src/billing/recordHistoricalCashDisposition.ts");
  const checkout = read("functions/src/proposals/createProposalCheckout.ts");
  const ui = read("public/management/billing/billing.js");
  assert.match(api, /requireProposalStaffAccess/);
  assert.match(api, /requireProposalLocationAccess/);
  assert.match(api, /!== "DRAFT"/);
  assert.match(api, /HISTORICAL_CASH_DISPOSITION_RECORDED/);
  assert.match(api, /checkoutAuthorized: false/);
  assert.match(api, /creditApplied: false/);
  assert.match(api, /refundExecuted: false/);
  assert.doesNotMatch(api, /stripe\./);
  assert.match(checkout, /Array.isArray\(proposal.priorPayments\)/);
  assert.match(ui, /recordHistoricalCashDispositionCall/);
  assert.match(ui, /Review unapplied cash/);
});
