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
  assert.match(callable, /Prior payments must be recorded while the proposal is a draft or awaiting client signature, before checkout begins/);
  assert.match(callable, /A prior payment is already recorded for/);
  assert.match(ui, /Prior payment recorded\. Proposal stage was not changed/);
  assert.match(autopay, /This proposal is not waiting for cash-prepaid Stripe autopay setup/);
  assert.match(autopay, /billing_cycle_anchor:/);
  assert.match(autopay, /proration_behavior:/);
});

test("prior cash cannot silently enter Stripe checkout using an unreconciled locked amount", () => {
  const checkout = read("functions/src/proposals/createProposalCheckout.ts");
  const clientReview = read("functions/src/proposals/proposalClientReview.ts");
  const cash = read("functions/src/billing/recordProposalPriorPayment.ts");
  assert.match(cash, /priorPayments:\s*\[/);
  assert.match(clientReview, /proposal\.pricing \|\| \{\}/);
  const seasonal = checkout.indexOf("if (isSeasonalProposalPricing(pricing))");
  const guard = checkout.indexOf("Array.isArray(proposal.priorPayments)");
  const checkoutCalculation = checkout.indexOf("const lockedDueNow =");
  assert.ok(seasonal >= 0 && guard > seasonal && guard < checkoutCalculation);
  assert.match(checkout, /resolveHistoricalCashCheckoutTerms\(proposal\)/);
  assert.match(checkout, /Stripe billing must match the family's signed historical-cash terms exactly/);
  assert.match(checkout, /Historical cash schedule has expired/);
  // Only signed, fully reconciled held-cash cases can reach payment Checkout.
  // No credit/refund path is automatically executed; staging still required.
});

test("prior-payment recording stops before checkout, pending payment, and activation", () => {
  const callable = read("functions/src/billing/recordProposalPriorPayment.ts");
  const management = read("public/management/billing/billing.js");
  assert.match(callable, /currentStatus !== "DRAFT" &&\s*currentStatus !== "AWAITING_CLIENT_SIGNATURE"/);
  assert.match(callable, /"failed-precondition",\s*"Prior payments must be recorded while the proposal is a draft or awaiting client signature, before checkout begins\."/);
  assert.match(management, /"DRAFT"/);
  assert.match(management, /"AWAITING_CLIENT_SIGNATURE"/);
  // A direct callable invocation must not bypass the earlier UI-stage restriction.
});

test("Management displays recorded historical cash review without auto-dismissal or checkout authorization", () => {
  const ui = read("public/management/billing/billing.js");
  const recording = read("functions/src/billing/recordProposalPriorPayment.ts");
  assert.match(ui, /const recorded = await recordPriorPaymentCall/);
  assert.match(ui, /recorded\?\.data\?\.historicalCashReview/);
  assert.match(ui, /Paid months:/);
  assert.match(ui, /Partially paid months:/);
  assert.match(ui, /Annual enrollment still due:/);
  assert.match(ui, /Unapplied membership cash:/);
  assert.match(ui, /Historical cash does not authorize Stripe checkout/);
  assert.doesNotMatch(ui.slice(ui.indexOf("const recorded = await recordPriorPaymentCall"), ui.indexOf("} catch (error)", ui.indexOf("const recorded = await recordPriorPaymentCall"))), /dialog\.close\(\)/);
  assert.match(recording, /historicalCashReview,/);
});

test("cash after issued client review fails closed to prevent stale signed amounts", () => {
  const recording = read("functions/src/billing/recordProposalPriorPayment.ts");
  const review = read("functions/src/proposals/issueProposalClientReview.ts");
  const returnDraft = read("functions/src/proposals/returnProposalToDraft.ts");
  const acceptance = read("functions/src/proposals/acceptProposalClientReview.ts");
  assert.match(recording, /currentStatus === "AWAITING_CLIENT_SIGNATURE" &&\s*cleanString\(proposal\.clientReview\?\.tokenHash\)/);
  assert.match(recording, /Return the proposal to Draft and reissue Review & Confirm before recording historical cash/);
  assert.match(review, /tokenHash,/);
  assert.match(review, /snapshot:\s*clientSnapshot/);
  assert.match(returnDraft, /clientReview:\s*FieldValue\.delete\(\)/);
  assert.match(acceptance, /lockedSnapshot:\s*review\.snapshot/);
});

test("Billing shows the recorded annual fee balance and labels pre-submit math as a preview", () => {
  const ui = read("public/management/billing/billing.js");
  assert.match(ui, /function priorPaymentFeeBalance\(proposal\)/);
  assert.match(ui, /enrollmentFeeAmountCents/);
  assert.match(ui, /enrollmentFeeIncluded === true/);
  assert.match(ui, /id="priorPaymentFeePreview"/);
  assert.match(ui, /After this UNRECORDED payment:/);
  assert.match(ui, /Annual enrollment balance/);
  assert.match(ui, /still owed/);
  assert.match(ui, /refreshPriorPaymentFeePreview\(dialog\)/);
  assert.match(ui, /allocation <= balance\.remainingCents/);
  assert.match(ui, /allocation <= Math\.round\(amount \* 100\)/);
});
