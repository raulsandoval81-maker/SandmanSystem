import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateManagementEstimate } from "../../public/management/pricing/pricing-estimate-model.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const athlete = {
  plan: "standard",
  memberType: "youth",
  journey: "zero2hero",
  billingTerm: "month-to-month",
  trainingAccess: "core-2",
  credit: 0,
  disciplines: ["wrestling"],
};

test("partial annual fee reduces $30 to $10 without changing monthly membership", () => {
  const baseline = calculateManagementEstimate([athlete], {
    startDate: "2026-11-01",
  });
  const partial = calculateManagementEstimate([athlete], {
    startDate: "2026-11-01",
    enrollmentPreviouslyPaidAmount: 20,
  });

  assert.equal(partial.annualEnrollment, 30);
  assert.equal(partial.enrollmentPreviouslyPaid, 20);
  assert.equal(partial.dueAtEnrollment, baseline.dueAtEnrollment - 20);
  assert.equal(partial.nextMonthlyPayment, baseline.nextMonthlyPayment);
});

test("Management surfaces submit explicit cents while retaining the legacy full-fee checkbox", () => {
  const pricing = read("public/management/pricing/pricing.js");
  const billing = read("public/management/billing/billing.js");
  const calculator = read("public/connect/admissions/calculator/calculator.js");

  for (const source of [pricing, billing]) {
    assert.match(source, /enrollmentFeeAmountCents/);
    assert.match(source, /enrollmentFeeIncluded/);
  }
  assert.match(calculator, /priorPaymentEnrollmentAmount/);
  assert.match(calculator, /proposalEnrollmentPreviouslyPaidAmount/);
});
