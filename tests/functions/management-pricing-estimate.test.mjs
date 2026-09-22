import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateManagementEstimate } from "../../public/management/pricing/pricing-estimate-model.js";
import { SANDMAN_PRICING_CATALOG as catalog } from "../../public/assets/js/pricing/sandman-pricing-catalog.js";

const combat = (overrides = {}) => ({
  plan: "standard", memberType: "youth", trainingAccess: "core-2",
  billingTerm: "month-to-month", disciplines: ["wrestling"], credit: 0,
  ...overrides,
});
const fitness = (overrides = {}) => ({
  plan: "fitness", trainingAccess: "2", billingTerm: "month-to-month", ...overrides,
});

test("A–D: enrollment is $30 per Combat athlete without a household cap", () => {
  for (const count of [1, 2, 3, 4, 5, 6]) {
    const estimate = calculateManagementEstimate(Array.from({ length: count }, () => combat()));
    assert.equal(estimate.annualEnrollment, count * 30);
    assert.equal(estimate.eligibleCount, count);
  }
});

test("E–G: Fitness is excluded, mixed households count Combat, youth/adult are equal", () => {
  assert.equal(calculateManagementEstimate([fitness()]).annualEnrollment, 0);
  const mixed = calculateManagementEstimate([combat(), fitness()]);
  assert.equal(mixed.annualEnrollment, 30);
  assert.equal(mixed.monthlyMembership, 100 + catalog.fitness.twoDays.monthly);
  assert.equal(calculateManagementEstimate([combat({ memberType: "youth" })]).annualEnrollment,
    calculateManagementEstimate([combat({ memberType: "adult" })]).annualEnrollment);
});

test("H: household/access/term rates match the current shared catalog", () => {
  for (const size of [1, 2, 3, 4]) {
    for (const access of catalog.combat.accessOrder) {
      for (const [term, engineTerm] of [["annual", "annual"], ["sixMonth", "six-month"],
        ["monthToMonth", "month-to-month"]]) {
        const athletes = Array.from({ length: size }, () => combat({
          trainingAccess: access, billingTerm: engineTerm,
          disciplines: access === "dual-full" ? ["wrestling", "boxing"] : ["wrestling"],
        }));
        const estimate = calculateManagementEstimate(athletes);
        assert.equal(estimate.monthlyBase, catalog.combat.householdPricing[String(size)][access][term].amount);
      }
    }
  }
  assert.equal(calculateManagementEstimate([fitness({ trainingAccess: "3" })]).monthlyBase,
    catalog.fitness.threeDays.monthly);
  assert.throws(() => calculateManagementEstimate([{ plan: "combo" }]), /Only current/);
});

test("approved adjustments and proration do not change base catalog prices", () => {
  const estimate = calculateManagementEstimate([combat({ credit: 25 })], {
    startDate: "2026-10-17", enrollmentSupportPercent: 25,
    monthlySponsorPercent: 25, promotionAmount: 25,
  });
  assert.equal(estimate.monthlyBase, 100);
  assert.equal(estimate.monthlySponsor, 25);
  assert.equal(estimate.nextMonthlyPayment, 75);
  assert.equal(estimate.annualEnrollment, 30);
  assert.equal(estimate.admissionsCredits, 25);
  assert.equal(estimate.enrollmentSupport, 7.5);
  assert.equal(estimate.proratedFirstMonth, 37.5);
  assert.equal(estimate.promotion, 0);
  assert.equal(estimate.dueAtEnrollment, 37.5);
});

test("I–J: reset returns to current default and print uses the same live results DOM", () => {
  const html = readFileSync(new URL("../../public/management/pricing/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../../public/management/pricing/pricing.js", import.meta.url), "utf8");
  assert.match(script, /function resetEstimate\(\)[\s\S]*trainingAccess: "core-2"/);
  assert.match(script, /enrollmentSupport\.value = "0"/);
  assert.match(script, /monthlySponsor\.value = "0"/);
  assert.match(script, /window\.print\(\)/);
  assert.match(html, /id="annualMembershipTotal"/);
  assert.match(html, /id="dueAtEnrollment"/);
  assert.match(html, /id="nextMonthlyPayment"/);
  assert.doesNotMatch(script, /httpsCallable|checkout\.sessions|subscriptions\.create|setDoc|addDoc/);
  assert.doesNotMatch(html, /value="combo"|Primary Sport|Second Sport|>\s*Sports\s*</);
});
