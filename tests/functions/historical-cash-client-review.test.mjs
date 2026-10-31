import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { buildHistoricalCashClientDisclosure, buildClientProposalSnapshot } =
  require("../../functions/lib/proposals/proposalClientReview.js");
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const payments = [
  { paymentId: "sep", amountCents: 10000, membershipAmountCents: 10000, enrollmentFeeAmountCents: 0,
    unappliedMembershipAmountCents: 2000, membershipPeriodAllocations: [{ period: "2026-09", paidCents: 8000 }] },
  { paymentId: "oct", amountCents: 10000, membershipAmountCents: 8000, enrollmentFeeAmountCents: 2000,
    unappliedMembershipAmountCents: 0, membershipPeriodAllocations: [{ period: "2026-10", paidCents: 8000 }] },
];
const pricing = { monthlyBalance: 80, enrollmentBase: 30, firstRecurringChargeDate: "2026-11-05" };
const { validateHistoricalCashDisposition } = require("../../functions/lib/billing/historicalCashDisposition.js");
const decision = validateHistoricalCashDisposition({ priorPayments: payments,
  monthlyMembershipCents: 8000, enrollmentFeeCents: 3000,
  kind: "hold_unapplied", amountCents: 2000 });
const proposal = { pricing, priorPayments: payments, historicalCashDisposition: {
  status: "recorded", kind: decision.kind, amountCents: decision.amountCents,
  targetPeriod: decision.targetPeriod, ledgerFingerprint: decision.ledgerFingerprint
} };

test("signed cash disclosure includes paid September/October and pending $20 surplus", () => {
  const disclosure = buildHistoricalCashClientDisclosure(proposal);
  assert.deepEqual(disclosure.fullyPaidPeriods, ["2026-09", "2026-10"]);
  assert.equal(disclosure.recordedCashCents, 20000);
  assert.equal(disclosure.enrollmentRemainingCents, 1000);
  assert.equal(disclosure.unappliedMembershipCents, 2000);
  assert.deepEqual(disclosure.disposition, { kind: "hold_unapplied", amountCents: 2000,
    targetPeriod: null, creditApplied: false, refundExecuted: false });
  assert.equal(disclosure.proposedFirstRecurringChargeDate, "2026-11-05");
  assert.equal(disclosure.proposedFirstRecurringPeriodPaidCents, 0);
  assert.equal(disclosure.checkoutAuthorized, false);
  assert.deepEqual(buildClientProposalSnapshot("P-000019", proposal).historicalCash, disclosure);
});

test("missing decision or changed ledger blocks family snapshot issuance", () => {
  assert.throws(() => buildClientProposalSnapshot("P-1", {
    ...proposal, historicalCashDisposition: undefined
  }), /explicit disposition/);
  assert.throws(() => buildClientProposalSnapshot("P-1", {
    ...proposal, priorPayments: payments.map((p,i) => i ? { ...p, paymentId: "modified" } : p)
  }), /does not match/);
});

test("unbalanced historical cash and invalid billing date cannot be silently signed", () => {
  assert.throws(() => buildHistoricalCashClientDisclosure({
    ...proposal, priorPayments: [{...payments[0], amountCents: 11000}]
  }), /unresolved inconsistencies/);
  assert.throws(() => buildHistoricalCashClientDisclosure({
    ...proposal, pricing: { ...pricing, firstRecurringChargeDate: "2026-11-06" }
  }), /fifth-of-month/);
});

test("proposal without old cash stays compatible", () => {
  assert.equal(buildHistoricalCashClientDisclosure({ pricing }), null);
  assert.equal(buildClientProposalSnapshot("P-2", { pricing }).historicalCash, null);
});

test("signature endpoint checks signed cash against current ledger; checkout remains blocked", () => {
  const acceptance = read("functions/src/proposals/acceptProposalClientReview.ts");
  const issue = read("functions/src/proposals/issueProposalClientReview.ts");
  const checkout = read("functions/src/proposals/createProposalCheckout.ts");
  const ui = read("public/connect/proposals/review/review.js");
  assert.match(acceptance, /JSON.stringify\(review.snapshot.historicalCash\) !== JSON.stringify\(currentHistoricalCash\)/);
  assert.match(issue, /Existing client-review snapshot predates historical cash disclosure/);
  assert.match(ui, /historicalCash/);
  assert.match(ui, /Historical cash checkout/);
  assert.match(checkout, /Array.isArray\(proposal.priorPayments\)/);
});
