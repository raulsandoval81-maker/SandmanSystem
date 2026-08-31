import test from "node:test";
import assert from "node:assert/strict";

import {
  F8_POLICY_VERSION,
  F8_PROGRESSION_POLICY,
  F8_RANKS,
  F8_SOURCE_XP_VALUES,
  F8_STRIPE_PERCENTAGES,
  F8_STRIPES_PER_RANK,
  F8_TOTAL_JOURNEY_XP,
  calculateF8StripeCount,
  calculateF8StripeThresholds,
  hasReachedF8RankXpRequirement,
  resolveF8CombinedStrengthHonorMonthlyCap,
  resolveF8CompetitionMonthlyCap,
  resolveF8RankMetadata,
  resolveF8RankXpCap,
} from "../../functions/lib/policy/f8ProgressionPolicy.js";

const expectedRanks = [
  {
    id: "shadow",
    tier: "T0",
    name: "Shadow",
    xpCap: 800,
    stripes: [200, 400, 600, 784],
    supplementalCap: 40,
    competitionCap: 0,
  },
  {
    id: "prospect",
    tier: "T1",
    name: "Prospect",
    xpCap: 1600,
    stripes: [400, 800, 1200, 1568],
    supplementalCap: 40,
    competitionCap: 50,
  },
  {
    id: "competitor",
    tier: "T2",
    name: "Competitor",
    xpCap: 2200,
    stripes: [550, 1100, 1650, 2156],
    supplementalCap: 60,
    competitionCap: 80,
  },
  {
    id: "contender",
    tier: "T3",
    name: "Contender",
    xpCap: 2800,
    stripes: [700, 1400, 2100, 2744],
    supplementalCap: 90,
    competitionCap: 80,
  },
  {
    id: "hero",
    tier: "T4",
    name: "Hero",
    xpCap: 3400,
    stripes: [850, 1700, 2550, 3332],
    supplementalCap: 120,
    competitionCap: 80,
  },
];

test("policy is versioned, immutable, and defines one progression bar", () => {
  assert.equal(F8_POLICY_VERSION, "f8-five-rank-v1");
  assert.equal(F8_PROGRESSION_POLICY.version, F8_POLICY_VERSION);
  assert.equal(F8_PROGRESSION_POLICY.progressionBars, 1);
  assert.ok(Object.isFrozen(F8_PROGRESSION_POLICY));
  assert.ok(Object.isFrozen(F8_RANKS));
  assert.ok(F8_RANKS.every(Object.isFrozen));
  assert.ok(Object.isFrozen(F8_SOURCE_XP_VALUES));
});

test("policy defines exactly five ranks in the approved order and caps", () => {
  assert.equal(F8_RANKS.length, 5);
  assert.deepEqual(
    F8_RANKS.map(({ name, xpCap }) => ({ name, xpCap })),
    expectedRanks.map(({ name, xpCap }) => ({ name, xpCap }))
  );
  assert.equal(F8_TOTAL_JOURNEY_XP, 10800);
  assert.equal(F8_PROGRESSION_POLICY.totalJourneyXp, 10800);
});

test("rank metadata and caps resolve by id, tier, or display name", () => {
  for (const expected of expectedRanks) {
    assert.equal(resolveF8RankMetadata(expected.id).name, expected.name);
    assert.equal(resolveF8RankMetadata(expected.tier).name, expected.name);
    assert.equal(resolveF8RankMetadata(expected.name).name, expected.name);
    assert.equal(resolveF8RankXpCap(expected.id), expected.xpCap);
  }

  assert.throws(() => resolveF8RankMetadata("T7"), /Unknown Foundry 8 rank/);
});

test("every rank has four stripes at 25, 50, 75, and 98 percent", () => {
  assert.equal(F8_STRIPES_PER_RANK, 4);
  assert.deepEqual([...F8_STRIPE_PERCENTAGES], [25, 50, 75, 98]);

  for (const expected of expectedRanks) {
    assert.deepEqual(
      [...calculateF8StripeThresholds(expected.id)],
      expected.stripes
    );
  }
});

for (const expected of expectedRanks) {
  test(`${expected.name} stripe boundaries are exact`, () => {
    expected.stripes.forEach((boundary, index) => {
      assert.equal(
        calculateF8StripeCount(expected.id, boundary - 1),
        index
      );
      assert.equal(
        calculateF8StripeCount(expected.id, boundary),
        index + 1
      );
    });
  });

  test(`${expected.name} Stripe IV is distinct from XP eligibility`, () => {
    const stripeFourXp = expected.stripes[3];

    assert.equal(calculateF8StripeCount(expected.id, stripeFourXp), 4);
    assert.equal(
      hasReachedF8RankXpRequirement(expected.id, stripeFourXp),
      false
    );
    assert.equal(
      hasReachedF8RankXpRequirement(expected.id, expected.xpCap),
      true
    );
    assert.equal(
      calculateF8StripeCount(expected.id, expected.xpCap + 10000),
      4
    );
  });
}

test("combined Strength and Honor monthly caps match the approved ranks", () => {
  assert.deepEqual(
    expectedRanks.map(({ id }) =>
      resolveF8CombinedStrengthHonorMonthlyCap(id)
    ),
    [40, 40, 60, 90, 120]
  );
});

test("competition monthly caps match the approved ranks", () => {
  assert.deepEqual(
    expectedRanks.map(({ id }) => resolveF8CompetitionMonthlyCap(id)),
    [0, 50, 80, 80, 80]
  );
});

test("approved source XP values are exact", () => {
  assert.deepEqual([...F8_SOURCE_XP_VALUES.combatPractice], [5, 10]);
  assert.equal(F8_SOURCE_XP_VALUES.conditioning, 5);
  assert.equal(F8_SOURCE_XP_VALUES.shorterRemoteStrength, 5);
  assert.equal(F8_SOURCE_XP_VALUES.ironWork, 10);
  assert.equal(F8_SOURCE_XP_VALUES.honor, 5);

  assert.deepEqual(F8_SOURCE_XP_VALUES.tournament, {
    participation: 10,
    secondDivision: 5,
    podium: 5,
    maximum: 20,
    styleIqProgression: 0,
  });
});
