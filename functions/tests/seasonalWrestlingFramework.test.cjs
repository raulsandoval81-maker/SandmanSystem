const test = require("node:test");
const assert = require("node:assert/strict");
const { seasonalWrestlingQuote, SEASONAL_WRESTLING_SHARED_POLICY, SEASONAL_WRESTLING_CAMPAIGNS } =
  require("../lib/proposals/seasonalWrestlingFramework");

test("approved seasonal tuition and waived enrollment display separately", () => {
  const early = [32000, 47000, 62000, 77000];
  const regular = [35000, 50000, 65000, 80000];
  for (let athletes = 1; athletes <= 4; athletes++) {
    for (const [isEarly, expected] of [[true, early[athletes - 1]], [false, regular[athletes - 1]]]) {
      const quote = seasonalWrestlingQuote({ athleteCount: athletes, earlyRegistration: isEarly });
      assert.equal(quote.tuitionCents, expected);
      assert.equal(quote.enrollmentFeeFaceValueCents, athletes * 3000);
      assert.equal(quote.enrollmentFeeWaivedCents, athletes * 3000);
      assert.equal(quote.enrollmentFeeDueCents, 0);
      assert.equal(quote.totalDueCents, expected);
      assert.equal(quote.plannedInstallmentsCents.length, 3);
      assert.equal(quote.plannedInstallmentsCents.reduce((sum, cents) => sum + cents, 0), expected);
      assert.ok(quote.plannedInstallmentsCents.every((cents) => Number.isSafeInteger(cents) && cents >= 50));
    }
  }
});

test("not active and no future payment authorization", () => {
  assert.equal(SEASONAL_WRESTLING_SHARED_POLICY.chargeFutureInstallmentsAutomatically, false);
  assert.equal(SEASONAL_WRESTLING_SHARED_POLICY.daysBetweenInstallments, 14);
  for (const season of ["winter", "spring", "fall"]) {
    assert.equal(SEASONAL_WRESTLING_CAMPAIGNS[season].enabledForCheckout, false);
  }
  assert.equal(SEASONAL_WRESTLING_CAMPAIGNS.spring.seasonStart, null);
  assert.equal(SEASONAL_WRESTLING_CAMPAIGNS.fall.seasonStart, null);
});

test("invalid athlete counts are rejected", () => {
  for (const count of [0, -1, 1.25, NaN, Infinity]) {
    assert.throws(() => seasonalWrestlingQuote({ athleteCount: count, earlyRegistration: true }));
  }
});
