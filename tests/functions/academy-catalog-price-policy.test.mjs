import assert from "node:assert/strict";
import test from "node:test";
import { validateExistingCatalogPrice } from "../../scripts/stripe/academy-catalog-price-policy.mjs";
import { currentV4RecurringCatalog } from "../../scripts/stripe/academy-v4-recurring-catalog.mjs";

const product = { id: "prod_1" };
const recurring = { amount: 8500, recurring: true };
const price = {
  unit_amount: 8500, currency: "usd", active: true,
  product: "prod_1", type: "recurring",
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
};
const key = "sandman_academy-2026-v3_combat_1disc_23_mtm";

test("matching recurring and one-time Prices are accepted", () => {
  assert.equal(validateExistingCatalogPrice(recurring, product, price, key), price);
  const oneTime = { ...price, type: "one_time", recurring: null };
  assert.equal(validateExistingCatalogPrice({ amount: 8500, recurring: false }, product, oneTime, key), oneTime);
  assert.throws(() => validateExistingCatalogPrice({ amount: 8500, recurring: false }, product,
    price, key), /type: expected "one_time", actual "recurring"/);
});

test("wrong amount, currency, interval, usage type, product, or inactive Price fails clearly", () => {
  for (const [field, changed] of [
    ["unit_amount", { ...price, unit_amount: 9000 }],
    ["currency", { ...price, currency: "eur" }],
    ["recurring_interval", { ...price, recurring: { ...price.recurring, interval: "year" } }],
    ["recurring_interval_count", { ...price, recurring: { ...price.recurring, interval_count: 2 } }],
    ["recurring_usage_type", { ...price, recurring: { ...price.recurring, usage_type: "metered" } }],
    ["active", { ...price, active: false }],
    ["product", { ...price, product: "prod_other" }],
  ]) {
    assert.throws(() => validateExistingCatalogPrice(recurring, product, changed, key),
      (error) => error.message.includes(key) && error.message.includes(field) &&
        error.message.includes("expected") && error.message.includes("actual"));
  }
});

test("historical $90 key is rejected for an $85 catalog item", () => {
  assert.throws(() => validateExistingCatalogPrice(recurring, product,
    { ...price, unit_amount: 9000 }, key), /expected 8500, actual 9000/);
});

test("every generated v4 recurring Price validates against its catalog amount", async () => {
  const items = await currentV4RecurringCatalog();
  assert.equal(items.length, 60);
  assert.equal(new Set(items.map((item) => item.lookupKey)).size, 60);
  for (const item of items) {
    validateExistingCatalogPrice(item, product, { ...price, unit_amount: item.amount }, item.lookupKey);
  }
});
