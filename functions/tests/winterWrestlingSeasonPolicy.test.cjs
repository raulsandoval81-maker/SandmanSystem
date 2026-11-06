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

test("V2 early price is $300 per athlete with installment totals intact", () => {
  const {WINTER_WRESTLING_2026_27, winterWrestlingRequiredPractices} = require("../lib/proposals/winterWrestlingSeasonPolicy");
  assert.equal(WINTER_WRESTLING_2026_27.minAge, 7);
  assert.equal(WINTER_WRESTLING_2026_27.maxAge, 13);
  assert.equal(WINTER_WRESTLING_2026_27.seasonEnd, "2027-02-27");
  assert.equal(winterWrestlingRequiredPractices("monday-wednesday-saturday")[0], "2026-11-30");
  for (let count = 1; count <= 5; count++) {
    const plan = winterWrestlingPaymentPlan(count, false, true);
    assert.equal(plan.totalCents, count * 30000);
    assert.equal(plan.installmentsCents.reduce((sum, value) => sum + value, 0), count * 30000);
    assert.ok(plan.installmentsCents.every(value => value > 0));
    assert.equal(buildWinterWrestlingSchedule(count, "2026-11-27", true, "monday-wednesday-saturday", true).totalCents, count * 30000);
  }
  assert.throws(() => buildWinterWrestlingSchedule(1, "2026-11-28", true, "monday-wednesday-saturday", true), /Early registration/);
  assert.equal(buildWinterWrestlingSchedule(1, "2026-11-28", true).totalCents, 35000);
});

test("canonical seasonal proposals use server-side $300 early and $350 regular rates", () => {
  const { canonicalSeasonalPricing } = require("../lib/proposals/seasonalProposal");
  const athletes = [{ name: "Synthetic athlete" }];
  const create = (date) => canonicalSeasonalPricing({
    seasonalEnrollmentDate: date,
    trainingSchedule: "monday-wednesday-saturday",
    payInFull: true,
  }, athletes);
  const early = create("2026-11-27");
  assert.equal(early.perAthleteCents, 30000);
  assert.equal(early.totalCents, 30000);
  assert.equal(early.discountTotalCents, 5000);
  assert.equal(early.earlyRegistration, true);
  assert.equal(early.seasonEnd, "2027-02-27");
  const standard = create("2026-11-28");
  assert.equal(standard.perAthleteCents, 35000);
  assert.equal(standard.totalCents, 35000);
  assert.equal(standard.earlyRegistration, false);
  assert.equal(standard.discountTotalCents, 0);
});

test("early-rate checkout grace requires original start by Nov 27 and closes Nov 30", () => {
  const {
    winterWrestlingEarlyCheckoutAllowed: allowed,
    winterWrestlingEarlyPaymentOnTime: paidOnTime,
    winterWrestlingPacificDate: day,
  } = require("../lib/proposals/winterWrestlingSeasonPolicy");
  assert.equal(allowed({ today: "2026-11-27" }), true);
  assert.equal(allowed({ today: "2026-11-28" }), false);
  assert.equal(allowed({ today: "2026-11-28", initialCheckoutDate: "2026-11-27" }), true);
  assert.equal(allowed({ today: "2026-11-30", initialCheckoutDate: "2026-11-27" }), true);
  assert.equal(allowed({ today: "2026-12-01", initialCheckoutDate: "2026-11-27" }), false);
  assert.equal(allowed({ today: "2026-11-30", initialCheckoutDate: "2026-11-28" }), false);
  const latest = Date.parse("2026-12-01T07:59:59Z") / 1000;
  const late = Date.parse("2026-12-01T08:00:00Z") / 1000;
  assert.equal(day(latest * 1000), "2026-11-30");
  assert.equal(day(late * 1000), "2026-12-01");
  assert.equal(paidOnTime(latest), true);
  assert.equal(paidOnTime(late), false);
  assert.equal(paidOnTime(undefined), false);
});
