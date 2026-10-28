import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const policy = require("../../functions/lib/proposals/winterWrestlingSeasonPolicy.js");
const seasonal = require("../../functions/lib/proposals/seasonalProposal.js");

test("approved $350 pricing supports one to five athletes and reconciles installments", () => {
  for (let count = 1; count <= 5; count += 1) {
    for (const payInFull of [false, true]) {
      const result = policy.buildWinterWrestlingSchedule(
        count,
        "2026-11-15",
        payInFull,
        "monday-wednesday-saturday",
      );
      assert.equal(result.totalCents, count * 35000);
      assert.equal(
        result.installments.reduce((sum, entry) => sum + entry.amountCents, 0),
        result.totalCents,
      );
      assert.equal(
        result.installments.length,
        payInFull ? 1 : policy.WINTER_WRESTLING_2026_27.paymentAmountsCents[count].length,
      );
    }
  }
});

test("proration counts only missed required practices and never exceeds 25 percent", () => {
  const monday = policy.winterWrestlingRequiredPractices("monday-wednesday-saturday");
  const tuesday = policy.winterWrestlingRequiredPractices("tuesday-thursday-saturday");
  assert.equal(monday.length, 32);
  assert.equal(tuesday.length, 31);
  for (const dates of [monday, tuesday]) {
    assert.equal(dates.includes("2026-11-23"), false, "Thanksgiving closure excluded");
    assert.equal(dates.includes("2026-12-24"), false, "Christmas closure excluded");
    assert.equal(dates.includes("2026-12-26"), false, "optional Saturday excluded");
  }
  const late = policy.winterWrestlingProration({
    athleteCount: 5,
    enrollmentDate: "2027-02-14",
    schedule: "monday-wednesday-saturday",
  });
  assert.equal(late.appliedPercent, 25);
  assert.equal(late.perAthleteDiscountCents, 8750);
  assert.equal(late.totalDiscountCents, 43750);
  assert.equal(late.enrollmentCutoffConfirmed, false);
});

test("server canonicalization locks pricing and requires late-enrollment review", () => {
  const athletes = Array.from({ length: 3 }, (_, index) => ({ name: `Athlete ${index + 1}` }));
  const pricing = seasonal.canonicalSeasonalPricing({
    billingType: "seasonal_one_time",
    seasonalEnrollmentDate: "2026-12-15",
    trainingSchedule: "tuesday-thursday-saturday",
    payInFull: false,
    lateEnrollmentReviewed: false,
    totalCents: 1,
  }, athletes);
  assert.equal(pricing.perAthleteCents, 35000);
  assert.equal(pricing.athleteCount, 3);
  assert.equal(pricing.automaticFuturePayments, false);
  assert.equal(pricing.enrollmentCutoff, null);
  assert.throws(
    () => seasonal.assertSeasonalProposalReady(pricing),
    /late-enrollment adjustment/i,
  );
});

test("seasonal Checkout stays payment-only and monthly subscription code remains intact", () => {
  const seasonalCheckout = fs.readFileSync(
    "functions/src/billing/seasonalProposalCheckout.ts",
    "utf8",
  );
  const monthlyCheckout = fs.readFileSync(
    "functions/src/proposals/createProposalCheckout.ts",
    "utf8",
  );
  assert.match(seasonalCheckout, /mode: "payment"/);
  assert.doesNotMatch(seasonalCheckout, /setup_future_usage|subscriptions\.create|payment_method_types/);
  assert.match(seasonalCheckout, /automatic future charges/);
  assert.match(monthlyCheckout, /recoverOrCreateProposalSubscription|payment_then_subscription_v1/);
});

test("public proposal flow exposes parent approval and seasonal schedule without an invented cutoff", () => {
  const builder = fs.readFileSync("public/connect/admissions/calculator/index.html", "utf8");
  const review = fs.readFileSync("public/connect/proposals/review/review.js", "utf8");
  const acceptance = fs.readFileSync("functions/src/proposals/acceptProposalClientReview.ts", "utf8");
  assert.match(builder, /Winter Wrestling 2026–27/);
  assert.match(builder, /No enrollment cutoff has been approved/);
  assert.match(review, /One-time installment/);
  assert.match(review, /Not automatic/);
  assert.match(acceptance, /parent or guardian must approve/i);
});
