const test = require("node:test");
const assert = require("node:assert/strict");
const { winterWrestlingPaymentPlan, buildWinterWrestlingSchedule } = require("../lib/proposals/winterWrestlingSeasonPolicy");

const expected = [
  [1, [20000, 15000]],
  [2, [40000, 30000]],
  [3, [45000, 35000, 25000]],
  [4, [60000, 45000, 35000]],
  [5, [75000, 55000, 45000]],
];
for (const [count, amounts] of expected) {
  test(`${count} athlete(s): totals, Stripe price IDs and schedule`, () => {
    const plan = winterWrestlingPaymentPlan(count);
    assert.deepEqual(plan.installmentsCents, amounts);
    assert.equal(plan.totalCents, count * 35000);
    const schedule = buildWinterWrestlingSchedule(count, "2026-10-28");
    assert.equal(schedule.requiresManualReview, false);
    assert.deepEqual(schedule.installments.map(i => i.amountCents), amounts);
    assert.ok(schedule.installments.every(i => i.stripePriceId && i.stripePriceId.startsWith("price_")));
  });
  test(`${count} athlete(s): paid in full`, () => {
    const plan = buildWinterWrestlingSchedule(count, "2026-10-28", true);
    assert.equal(plan.installments.length, 1);
    assert.equal(plan.installments[0].amountCents, count * 35000);
    assert.equal(plan.requiresManualReview, false);
  });
}
test("late enrollment requires manual review; no silent backdating", () => {
  assert.equal(buildWinterWrestlingSchedule(3, "2026-12-20").requiresManualReview, true);
});
test("rejects invalid dates and unapproved family sizes", () => {
  assert.throws(() => buildWinterWrestlingSchedule(1, "2026-02-30"));
  assert.throws(() => buildWinterWrestlingSchedule(6, "2026-10-28"));
});
