import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalogSource = await readFile("public/assets/js/pricing/sandman-pricing-catalog.js", "utf8");
const engineSource = await readFile("public/assets/js/pricing/sandman-pricing-engine.js", "utf8");
const catalogUrl = "data:text/javascript;base64," + Buffer.from(catalogSource).toString("base64");
const source = engineSource.replace(
  /from "\.\/sandman-pricing-catalog\.js";/,
  'from "' + catalogUrl + '";'
);
assert.notEqual(source, engineSource, "catalog import must be replaced");
const { calculateSandmanPaidInFullQuote, calculateSandmanMembershipPricing } =
  await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const { SANDMAN_PRICING_CATALOG: catalog } = await import(catalogUrl);

test("all 20 household/access combinations preserve approved six- and twelve-month prices", () => {
  for (const size of [1, 2, 3, 4]) {
    for (const access of catalog.combat.accessOrder) {
      for (const [term, months] of [["sixMonth", 6], ["annual", 12]]) {
        const athletes = Array.from({ length: size }, () => ({
          plan: "standard", trainingAccess: access, billingTerm: term
        }));
        const old = calculateSandmanMembershipPricing(athletes);
        const quote = calculateSandmanPaidInFullQuote(athletes, term);
        const record = catalog.combat.householdPricing[String(size)][access][term];
        assert.equal(old.monthlyMembership, record.amount);
        assert.equal(quote.monthlyRate, record.amount);
        assert.equal(quote.membershipTotal, record.amount * months);
        assert.equal(quote.annualEnrollmentFeeTotal, size * 30);
        assert.equal(quote.additionalDiscount, 0);
        assert.equal(quote.checkoutEnabled, false);
        assert.equal(quote.stripeRecurringLookupKey, record.lookup);
      }
    }
  }
});

test("prepaid quote rejects unsupported plans, mixed terms and fifth household member", () => {
  const a = { plan: "standard", trainingAccess: "core-2", billingTerm: "annual" };
  assert.throws(() => calculateSandmanPaidInFullQuote([a], "monthToMonth"));
  assert.throws(() => calculateSandmanPaidInFullQuote([a, {...a, billingTerm:"six-month"}], "annual"));
  assert.throws(() => calculateSandmanPaidInFullQuote([{ ...a, plan:"fitness" }], "annual"));
  assert.throws(() => calculateSandmanPaidInFullQuote([a,a,a,a,a], "annual"));
});

test("midterm sibling additions require a separate amendment and cannot enable checkout", () => {
  const a = { plan: "standard", trainingAccess: "dual-full", billingTerm: "six-month" };
  const q = calculateSandmanPaidInFullQuote([a,a], "sixMonth");
  assert.equal(q.midtermSiblingAddition, "management_amendment_required");
  assert.equal(q.quoteOnly, true);
  assert.equal(q.checkoutEnabled, false);
  assert.equal(catalog.paymentArrangements.paidInFull.sixMonthReconciliationEnabled, false);
});
