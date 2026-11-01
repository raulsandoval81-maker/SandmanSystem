import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync("public/management/billing/billing.js", "utf8");
const callable = readFileSync("functions/src/billing/correctP000019HistoricalAllocation.ts", "utf8");
const correction = readFileSync("functions/src/billing/correctP000019Payments.ts", "utf8");
const reconcile = readFileSync("functions/src/billing/historicalCashReconciliation.ts", "utf8");

test("Management correction adjusts existing receipts only; does not create a payment", () => {
  assert.match(ui, /data-correct-p000019/);
  assert.match(ui, /correctP000019HistoricalAllocationCall/);
  assert.match(ui, /confirmTotalReceivedCents: 20000/);
  assert.match(ui, /confirmEnrollmentRemainingCents: 1000/);
  assert.match(callable, /requireProposalStaffAccess/);
  assert.match(callable, /requireProposalLocationAccess/);
  assert.match(callable, /HISTORICAL_PAYMENT_ALLOCATION_CORRECTED/);
  assert.match(callable, /priorPaymentsBefore: correction.before/);
  assert.match(callable, /priorPaymentsAfter: correction.corrected/);
  assert.match(callable, /historicalPaymentCorrection/);
  assert.doesNotMatch(callable, /stripe|charge|tx\.create\(.*paymentRef/i);
});

test("Correction retains original receipt amount and monthly contractual rates", () => {
  assert.match(correction, /payment\.amountCents !== 10000/);
  assert.match(correction, /payments\.length !== 2/);
  assert.match(correction, /"2026-09": \{ membership: 10000, enrollment: 0, rate: 10000 \}/);
  assert.match(correction, /"2026-10": \{ membership: 8000, enrollment: 2000, rate: 8000 \}/);
  assert.match(correction, /historicalMonthlyRateCents: plan\.rate/);
  assert.match(reconcile, /requiredByPeriod\.get/);
});
