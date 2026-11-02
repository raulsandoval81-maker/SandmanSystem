import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const path = "public/management/shared/services/historical-payment-summary.js";
const helperSource = readFileSync(path, "utf8");
const { historicalPaymentSummary } = await import(
  "data:text/javascript;base64," + Buffer.from(helperSource).toString("base64")
);

const september = { amountCents: 10000, periods: ["2026-09"], enrollmentFeeIncluded: false,
  membershipAmountCents: 10000, enrollmentFeeAmountCents: 0,
  unappliedMembershipAmountCents: 0, historicalMonthlyRateCents: 10000,
  membershipPeriodAllocations: [{ period: "2026-09", paidCents: 10000 }] };
const octoberLegacy = { amountCents: 10000, periods: ["2026-10"], enrollmentFeeIncluded: false };
const octoberCorrected = {
  ...octoberLegacy, membershipAmountCents: 8000, enrollmentFeeAmountCents: 2000,
  unappliedMembershipAmountCents: 0, historicalMonthlyRateCents: 8000,
  membershipPeriodAllocations: [{ period: "2026-10", paidCents: 8000 }]
};
const proposal = (payments) => ({
  proposalId: "P-000019", pricing: { enrollmentBase: 30, monthlyBalance: 80, dueNow: 110 },
  priorPayments: payments
});

test("shared Management summary reflects receipts before and after correction", () => {
  const before = historicalPaymentSummary(proposal([september, octoberLegacy]));
  assert.deepEqual(
    [before.totalReceivedCents, before.enrollmentPaidCents, before.enrollmentRemainingCents],
    [20000, 0, 3000]
  );
  const after = historicalPaymentSummary(proposal([september, octoberCorrected]));
  assert.deepEqual(
    [after.totalReceivedCents, after.enrollmentPaidCents, after.enrollmentRemainingCents],
    [20000, 2000, 1000]
  );
  assert.equal(after.membershipLedgerComplete, true);
  assert.deepEqual(after.fullyPaidPeriods, ["2026-09", "2026-10"]);
  assert.equal(proposal([september, octoberCorrected]).pricing.dueNow, 110);
});

test("shared summary safely ignores proposals without receipts and rejects invalid amounts", () => {
  assert.equal(historicalPaymentSummary(proposal([])), null);
  assert.equal(historicalPaymentSummary(proposal([{ amountCents: "bad", enrollmentFeeIncluded: false }])), null);
  assert.equal(historicalPaymentSummary(proposal([{ amountCents: 1000, enrollmentFeeAmountCents: 2000 }])), null);
  assert.equal(historicalPaymentSummary(proposal([{ amountCents: 10000, enrollmentFeeAmountCents: 4000 }])), null);
  assert.equal(historicalPaymentSummary(proposal([{
    ...september, membershipPeriodAllocations: [{ period: "2026-09", paidCents: 8000 }]
  }])).membershipLedgerComplete, false);
});

test("three Management pages use shared ledger while checkout remains independently authorized", () => {
  const billing = readFileSync("public/management/billing/billing.js", "utf8");
  const proposals = readFileSync("public/connect/proposals/proposals.js", "utf8");
  const enrollment = readFileSync("public/management/enrollment-flow/enrollment-flow.js", "utf8");
  for (const page of [billing, proposals, enrollment]) {
    assert.match(page, /historicalPaymentSummary/);
    assert.match(page, /management\/shared\/services\/historical-payment-summary\.js/);
  }
  assert.match(proposals, /Original proposal amount \(not reconciled\)/);
  assert.match(enrollment, /ledgerType:ledger\?"historical":"prepaid"/);
  assert.doesNotMatch(helperSource, /httpsCallable|stripe|tx\.update|setDoc|updateDoc|createCheckout/i);
});

test("Prospect Builder consumes the shared ledger for enrollment and paid months", () => {
  const calculator = readFileSync("public/connect/admissions/calculator/calculator.js", "utf8");
  assert.match(calculator, /management\/shared\/services\/historical-payment-summary\.js/);
  assert.match(calculator, /historicalLedger\.enrollmentPaidCents/);
  assert.match(calculator, /historicalLedger\.fullyPaidPeriods/);
  assert.match(calculator, /agreement-start month previously paid/);
  assert.doesNotMatch(calculator, /function priorPaymentEnrollmentAmount/);
});
