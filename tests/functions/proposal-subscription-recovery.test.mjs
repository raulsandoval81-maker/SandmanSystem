import { createRequire } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";

const require = createRequire(import.meta.url);
const buildRoot = process.env.SANDMAN_TEST_BUILD_DIR || "../../functions/lib";
const { recoverOrCreateProposalSubscription } = require(`${buildRoot}/billing/proposalMonthlySponsor.js`);

const amounts = { monthlyBaseCents: 20000, monthlySponsorCents: 2500, monthlyBalanceCents: 17500 };
const coupon = { id: "sandman_proposal_monthly_sponsor_P-000001", amount_off: 2500 };
const identity = {
  proposalId: "P-000001", checkoutSessionId: "cs_1", customerId: "cus_1",
  firstRecurringChargeUnix: 1800000000,
  items: [{ price: "price_1", quantity: 1 }], amounts, coupon,
};

function subscription(withSponsor = true) {
  return {
    id: "sub_1", customer: "cus_1", status: "active",
    billing_cycle_anchor: 1800000000,
    metadata: {
      proposalId: "P-000001", checkoutSessionId: "cs_1",
      source: "admissions_proposal", billingFlowVersion: "payment_then_subscription_v1",
      monthlyBaseCents: "20000", monthlySponsorCents: withSponsor ? "2500" : "0",
      monthlyBalanceCents: withSponsor ? "17500" : "20000",
    },
    items: { data: [{ quantity: 1, price: {
      id: "price_1", currency: "usd", unit_amount: 20000,
      recurring: { interval: "month", interval_count: 1 },
    } }] },
    discounts: withSponsor ? [{ id: "di_1", subscription: "sub_1",
      source: { type: "coupon", coupon: coupon.id } }] : [],
  };
}

function fakeStripe(existing = []) {
  const stored = new Map(existing.map((item) => [item.id, item]));
  return {
    stored,
    subscriptions: {
      async retrieve(id) { return stored.get(id); },
      async list({ customer }) {
        return { data: [...stored.values()].filter((item) => item.customer === customer), has_more: false };
      },
    },
  };
}

test("saved subscription ID is verified and never recreated", async () => {
  const stripe = fakeStripe([subscription()]);
  const result = await recoverOrCreateProposalSubscription(stripe, identity, "sub_1", () => {
    throw new Error("must not create");
  });
  assert.equal(result.recovered, true);
  assert.equal(result.discountId, "di_1");
});

test("Stripe-recovered subscription and retry after create-before-Firestore never recreate", async () => {
  const stripe = fakeStripe([subscription()]);
  assert.equal((await recoverOrCreateProposalSubscription(stripe, identity, null,
    () => { throw new Error("must not create"); })).recovered, true);

  const fresh = fakeStripe();
  let created = 0;
  const create = async () => {
    created += 1;
    const item = subscription();
    fresh.stored.set(item.id, item);
    return item;
  };
  assert.equal((await recoverOrCreateProposalSubscription(fresh, identity, null, create)).recovered, false);
  assert.equal((await recoverOrCreateProposalSubscription(fresh, identity, null, create)).recovered, true);
  assert.equal(created, 1);
});

test("invalid or ambiguous recovered subscription fails closed", async () => {
  const wrong = subscription();
  wrong.items.data[0].price.id = "price_other";
  await assert.rejects(recoverOrCreateProposalSubscription(fakeStripe([wrong]), identity, null,
    () => { throw new Error("must not create"); }), /Price items mismatch/);
  const duplicate = { ...subscription(), id: "sub_2" };
  await assert.rejects(recoverOrCreateProposalSubscription(fakeStripe([subscription(), duplicate]), identity, null,
    () => { throw new Error("must not create"); }), /multiple Stripe subscriptions/);
  await assert.rejects(recoverOrCreateProposalSubscription(fakeStripe(), identity, "sub_missing",
    () => { throw new Error("must not create"); }), /saved Stripe subscription was not found/);
  const canceled = { ...subscription(), status: "canceled" };
  await assert.rejects(recoverOrCreateProposalSubscription(fakeStripe([canceled]), identity, null,
    () => { throw new Error("must not create"); }), /identity or schedule mismatch/);
});

test("unsponsored recovery requires no subscription discount", async () => {
  const unsponsored = { ...identity, coupon: null,
    amounts: { monthlyBaseCents: 20000, monthlySponsorCents: 0, monthlyBalanceCents: 20000 } };
  const stripe = fakeStripe([subscription(false)]);
  const result = await recoverOrCreateProposalSubscription(stripe, unsponsored, "sub_1",
    () => { throw new Error("must not create"); });
  assert.equal(result.discountId, null);
  await assert.rejects(recoverOrCreateProposalSubscription(fakeStripe([subscription()]), unsponsored, null,
    () => { throw new Error("must not create"); }), /identity or schedule mismatch|unapproved discount/);
});
