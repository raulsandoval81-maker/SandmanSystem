import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const require = createRequire(import.meta.url);
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const { resolveLockedRecurringPricing } = require(`${buildRoot}/proposals/lockedRecurringPricing.js`);
const { ensureProposalMonthlySponsorCoupon, verifyProposalSubscriptionDiscount } = require(`${buildRoot}/billing/proposalMonthlySponsor.js`);
const amounts = resolveLockedRecurringPricing(
  { monthlyBase: 200, monthlySponsor: 25, monthlyBalance: 175 }, 20000
);

function fakeStripe() {
  const coupons = new Map();
  let created = 0;
  return {
    coupons: {
      async retrieve(id) {
        if (!coupons.has(id)) throw { code: "resource_missing" };
        return coupons.get(id);
      },
      async create(data) {
        created += 1;
        const coupon = { ...data, valid: true };
        coupons.set(data.id, coupon);
        return coupon;
      },
    },
    get created() { return created; },
  };
}

test("locked base, sponsor and approved recurring balance reconcile", () => {
  assert.deepEqual(amounts, {
    monthlyBaseCents: 20000, monthlySponsorCents: 2500, monthlyBalanceCents: 17500,
  });
  for (const [pricing, catalog] of [
    [{ monthlyBase: 200, monthlySponsor: 25, monthlyBalance: 180 }, 20000],
    [{ monthlyBase: 200, monthlySponsor: 25, monthlyBalance: 175 }, 17500],
    [{ monthlyBase: 200, monthlySponsor: 200, monthlyBalance: 0 }, 20000],
    [{ monthlyBase: 200, monthlySponsor: -1, monthlyBalance: 201 }, 20000],
  ]) {
    assert.throws(() => resolveLockedRecurringPricing(pricing, catalog), /reconcile|invalid/);
  }
  assert.equal(resolveLockedRecurringPricing(
    { monthlyBase: 200, monthlySponsor: 0, monthlyBalance: 200 }, 20000
  ).monthlySponsorCents, 0);
});

test("one dedicated forever USD coupon survives webhook retries", async () => {
  const stripe = fakeStripe();
  const first = await ensureProposalMonthlySponsorCoupon(stripe, "P-000001", "ACADEMY_2026_V4", amounts);
  const retry = await ensureProposalMonthlySponsorCoupon(stripe, "P-000001", "ACADEMY_2026_V4", amounts);
  const other = await ensureProposalMonthlySponsorCoupon(stripe, "P-000002", "ACADEMY_2026_V4", amounts);
  assert.equal(stripe.created, 2);
  assert.equal(first.id, retry.id);
  assert.notEqual(first.id, other.id);
  assert.equal(first.amount_off, 2500);
  assert.equal(first.currency, "usd");
  assert.equal(first.duration, "forever");
  assert.deepEqual(first.metadata, {
    proposalId: "P-000001", sponsorAmount: "2500", pricingVersion: "ACADEMY_2026_V4",
    source: "proposal_monthly_sponsor",
  });
  await assert.rejects(
    ensureProposalMonthlySponsorCoupon(stripe, "P-000001", "ACADEMY_2026_V4", {
      ...amounts, monthlySponsorCents: 3000,
    }), /does not match/
  );
});

test("subscription discount is attached only to the intended subscription and produces locked balance", async () => {
  const coupon = await ensureProposalMonthlySponsorCoupon(fakeStripe(), "P-000001", "ACADEMY_2026_V4", amounts);
  const subscription = {
    id: "sub_1",
    items: { data: [{ quantity: 1, price: {
      currency: "usd", unit_amount: 20000,
      recurring: { interval: "month", interval_count: 1 },
    } }] },
    discounts: [{ id: "di_1", subscription: "sub_1", source: { type: "coupon", coupon: coupon.id } }],
  };
  assert.equal(verifyProposalSubscriptionDiscount(subscription, coupon, amounts), "di_1");
  assert.throws(() => verifyProposalSubscriptionDiscount({ ...subscription, discounts: [] }, coupon, amounts), /verified/);
  assert.throws(() => verifyProposalSubscriptionDiscount({ ...subscription, discounts: [
    { ...subscription.discounts[0], subscription: "sub_other" },
  ] }, coupon, amounts), /differs/);
  assert.throws(() => verifyProposalSubscriptionDiscount(subscription, coupon, {
    ...amounts, monthlyBalanceCents: 18000,
  }), /differs/);
  assert.throws(() => verifyProposalSubscriptionDiscount({ ...subscription,
    items: { data: [{ ...subscription.items.data[0], quantity: 2 }] },
  }, coupon, amounts), /base differs/);
  assert.equal(verifyProposalSubscriptionDiscount({ ...subscription, id: "sub_2", discounts: [] }, null, {
    monthlyBaseCents: 20000, monthlySponsorCents: 0, monthlyBalanceCents: 20000,
  }), null);
});

test("sponsor coupon is never added to the one-time Checkout Session", () => {
  const checkout = readFileSync(fileURLToPath(new URL("../../functions/src/proposals/createProposalCheckout.ts", import.meta.url)), "utf8");
  const webhook = readFileSync(fileURLToPath(new URL("../../functions/src/billing/webhook.ts", import.meta.url)), "utf8");
  assert.doesNotMatch(checkout, /sponsorCoupon|proposalMonthlySponsor|discounts:/);
  assert.match(webhook, /discounts: \[\{ coupon: sponsorCoupon\.id \}\]/);
});
