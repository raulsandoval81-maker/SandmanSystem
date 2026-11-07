const test = require("node:test");
const assert = require("node:assert/strict");
const {
  WINTER_WRESTLING_2026_27,
  winterWrestlingPaymentPlan,
  buildWinterWrestlingSchedule,
  winterWrestlingRequiredPractices,
} = require("../lib/proposals/winterWrestlingSeasonPolicy");

const quoteFor = (count, early) => (early ? 32000 : 35000) + (count - 1) * 15000;
const add14 = (date, days) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

for (let count = 1; count <= 5; count++) {
  for (const early of [true, false]) {
    test(`${count} athlete(s), ${early ? "early" : "regular"}: family tuition and 3 biweekly installments`, () => {
      const expected = quoteFor(count, early);
      const plan = winterWrestlingPaymentPlan(count, false, early);
      assert.equal(plan.totalCents, expected);
      assert.equal(plan.installmentsCents.length, 3);
      assert.equal(plan.installmentsCents.reduce((s, a) => s + a, 0), expected);
      const date = early ? "2026-11-06" : "2026-12-01";
      const schedule = buildWinterWrestlingSchedule(count, date, false, "monday-wednesday-saturday", early);
      assert.equal(schedule.totalCents, expected);
      assert.deepEqual(schedule.installments.map(x => x.dueDate),
        [date, add14(date, 14), add14(date, 28)]);
      assert.equal(schedule.installments.reduce((s, x) => s + x.amountCents, 0), expected);
      assert.equal(schedule.installments.length, 3);
      assert.equal(schedule.requiresManualReview, false);
    });
    test(`${count} athlete(s) pay-in-full at family price`, () => {
      const date = early ? "2026-11-06" : "2026-12-01";
      const plan = buildWinterWrestlingSchedule(count, date, true, "monday-wednesday-saturday", early);
      assert.equal(plan.installments.length, 1);
      assert.equal(plan.installments[0].amountCents, quoteFor(count, early));
    });
  }
}

test("approved late-start adjustment only discounts actual family tuition", () => {
  const date = "2027-01-04";
  const total = quoteFor(3, false);
  const schedule = buildWinterWrestlingSchedule(3, date);
  assert.ok(schedule.totalCents < total);
  assert.ok(schedule.totalCents >= total * 0.75);
  assert.equal(schedule.installments.reduce((s, x) => s + x.amountCents, 0), schedule.totalCents);
  assert.equal(schedule.requiresManualReview, true);
});
test("rejects invalid dates and unapproved family sizes", () => {
  assert.throws(() => buildWinterWrestlingSchedule(1, "2026-02-30"));
  assert.throws(() => buildWinterWrestlingSchedule(6, "2026-11-06"));
  assert.throws(() => buildWinterWrestlingSchedule(1, "2026-12-01", true, "monday-wednesday-saturday", true), /Early registration/);
});
test("season dates ages and pricing are locked", () => {
  assert.equal(WINTER_WRESTLING_2026_27.minAge, 7);
  assert.equal(WINTER_WRESTLING_2026_27.maxAge, 13);
  assert.equal(WINTER_WRESTLING_2026_27.seasonStart, "2026-11-30");
  assert.equal(WINTER_WRESTLING_2026_27.seasonEnd, "2027-02-27");
  assert.equal(WINTER_WRESTLING_2026_27.earlyPerAthleteCents, 32000);
  assert.equal(WINTER_WRESTLING_2026_27.additionalSiblingCents, 15000);
  assert.equal(winterWrestlingRequiredPractices("monday-wednesday-saturday")[0], "2026-11-30");
});
test("canonical server policy enforces verified siblings, waived fee, and one-time payments", () => {
  const { canonicalSeasonalPricing } = require("../lib/proposals/seasonalProposal");
  const create = (count, date, verified, payInFull) => canonicalSeasonalPricing({
    seasonalEnrollmentDate: date,
    trainingSchedule: "monday-wednesday-saturday",
    payInFull,
    siblingRelationshipVerified: verified,
  }, Array.from({length:count}, (_, i) => ({name:`Synthetic athlete ${i + 1}` })));
  assert.throws(() => create(3, "2026-11-06", false, false), /siblings/);
  const quote = create(3, "2026-11-06", true, false);
  assert.equal(quote.perAthleteCents, 32000);
  assert.equal(quote.additionalSiblingCents, 15000);
  assert.equal(quote.listPriceTotalCents, 65000);
  assert.equal(quote.discountTotalCents, 3000);
  assert.equal(quote.totalCents, 62000);
  assert.equal(quote.dueNowCents, 20666);
  assert.equal(quote.enrollmentFeeFaceValueCents, 9000);
  assert.equal(quote.enrollmentFeeWaivedCents, 9000);
  assert.equal(quote.enrollmentFeeDueCents, 0);
  assert.equal(quote.automaticFuturePayments, false);
  assert.deepEqual(quote.installments.map(x=>x.amountCents), [20666,20666,20668]);
  assert.deepEqual(quote.installments.map(x=>x.dueDate), ["2026-11-06","2026-11-20","2026-12-04"]);
  assert.equal(create(3, "2026-12-01", true, true).totalCents, 65000);
  assert.equal(create(1, "2026-11-06", false, true).totalCents, 32000);
});

test("flyer dates: early checkout through Nov 30, regular from Dec 1, retry grace through Dec 3", () => {
  const {
    winterWrestlingEarlyCheckoutAllowed: allowed,
    winterWrestlingEarlyPaymentOnTime: paidOnTime,
    winterWrestlingPacificDate: day,
  } = require("../lib/proposals/winterWrestlingSeasonPolicy");
  assert.equal(WINTER_WRESTLING_2026_27.earlyRegistrationDeadline, "2026-11-30");
  assert.equal(WINTER_WRESTLING_2026_27.earlyPaymentGraceDeadline, "2026-12-03");
  assert.equal(allowed({ today: "2026-11-30" }), true);
  assert.equal(allowed({ today: "2026-12-01" }), false);
  assert.equal(allowed({ today: "2026-12-01", initialCheckoutDate: "2026-11-30" }), true);
  assert.equal(allowed({ today: "2026-12-03", initialCheckoutDate: "2026-11-30" }), true);
  assert.equal(allowed({ today: "2026-12-04", initialCheckoutDate: "2026-11-30" }), false);
  assert.equal(allowed({ today: "2026-12-03", initialCheckoutDate: "2026-12-01" }), false);
  assert.equal(buildWinterWrestlingSchedule(1, "2026-11-30", true,
    "monday-wednesday-saturday", true).totalCents, 32000);
  assert.throws(() => buildWinterWrestlingSchedule(1, "2026-12-01", true,
    "monday-wednesday-saturday", true), /Early registration/);
  // Pacific 23:59:59 Dec 3 / midnight Dec 4 (PST, UTC-8).
  const latest = Date.parse("2026-12-04T07:59:59Z") / 1000;
  const late = Date.parse("2026-12-04T08:00:00Z") / 1000;
  assert.equal(day(latest * 1000), "2026-12-03");
  assert.equal(day(late * 1000), "2026-12-04");
  assert.equal(paidOnTime(latest), true);
  assert.equal(paidOnTime(late), false);
  assert.equal(paidOnTime(undefined), false);
});
