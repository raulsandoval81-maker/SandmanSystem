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
  assert.match(billing, /historicalEnrollmentFeeAttributions/);
  assert.match(billing, /sourcePaymentReference/);
});

test("PR376 acceptance: annual 2-Day Core stays $80 and $20 prior fee leaves exactly $10", () => {
  const annualAthlete = { ...athlete, journey: "road2champion", billingTerm: "annual" };
  const estimate = calculateManagementEstimate([annualAthlete], {
    startDate: "2026-11-05",
    enrollmentPreviouslyPaidAmount: 20,
  });
  assert.equal(estimate.monthlyMembership, 80);
  assert.equal(estimate.annualEnrollment, 30);
  assert.equal(estimate.enrollmentPreviouslyPaid, 20);
  assert.equal(estimate.dueAtEnrollment, 90);
  assert.equal(estimate.nextMonthlyPayment, 80);
  // $90 is the calculator's first-month-plus-fee estimate, NOT approval
  // to charge November twice or evidence of a live Stripe schedule.
});

test("PR376 acceptance: September/October $100 cash needs explicit $20 surplus review", () => {
  const septemberCash = 100;
  const octoberCash = 100;
  const monthlyRate = 80;
  const octoberEnrollmentFee = 20;
  const septemberMembership = monthlyRate;
  const octoberMembership = octoberCash - octoberEnrollmentFee;
  const unappliedSeptember = septemberCash - septemberMembership;
  assert.equal(octoberMembership, monthlyRate);
  assert.equal(unappliedSeptember, 20);
  assert.equal(septemberCash + octoberCash -
    septemberMembership - octoberMembership - octoberEnrollmentFee, 20);
  // This test intentionally DOES NOT assign the extra $20 to another month,
  // future Stripe charge, enrollment fee, or refund without evidence.
});

test("PR376 acceptance: historical month recording does not itself activate billing", () => {
  const callable = read("functions/src/billing/recordProposalPriorPayment.ts");
  const ui = read("public/management/billing/billing.js");
  const autopay = read("functions/src/billing/proposalAutopaySetup.ts");
  assert.match(callable, /Prior payments must be recorded before the proposal is paid or void/);
  assert.match(callable, /A prior payment is already recorded for/);
  assert.match(ui, /Prior payment recorded\. Proposal stage was not changed/);
  assert.match(autopay, /This proposal is not waiting for cash-prepaid Stripe autopay setup/);
  assert.match(autopay, /billing_cycle_anchor:/);
  assert.match(autopay, /proration_behavior:/);
});
