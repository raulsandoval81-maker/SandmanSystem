import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_F8_RANKS,
  buildF8MigrationReview,
  calculateF8MigrationProposal,
  classifyF8Candidate,
} from "../../scripts/f8-migration/f8-five-rank-migration-core.mjs";

const newBoundaries = [
  [0, "T0", 0],
  [799, "T0", 799],
  [800, "T1", 0],
  [2399, "T1", 1599],
  [2400, "T2", 0],
  [4799, "T2", 2399],
  [4800, "T3", 0],
  [7599, "T3", 2799],
  [7600, "T4", 0],
  [10800, "T4", 3200],
];

function inputForCumulative(target) {
  let consumed = 0;
  for (const rank of LEGACY_F8_RANKS) {
    if (target <= consumed + rank.xpCap) {
      return { tier: rank.tier, rankName: rank.name, xpCap: rank.xpCap, xp: target - consumed };
    }
    consumed += rank.xpCap;
  }
  throw new Error(`Cannot build legacy input for ${target}`);
}

test("legacy ladder totals 10,800", () => {
  assert.equal(LEGACY_F8_RANKS.reduce((sum, rank) => sum + rank.xpCap, 0), 10800);
});

test("new migration target ends at Champion while legacy T7 Hero remains historical input", () => {
  const result = calculateF8MigrationProposal(inputForCumulative(10800));
  assert.equal(LEGACY_F8_RANKS.at(-1).name, "Hero");
  assert.equal(result.proposal.proposedTier, "T4");
  assert.equal(result.proposal.proposedRank, "Champion");
  assert.equal(result.proposal.proposedActiveXp, 3200);
});

for (let index = 0, consumed = 0; index < LEGACY_F8_RANKS.length; index += 1) {
  const rank = LEGACY_F8_RANKS[index];
  const rankStart = consumed;
  for (const [label, xp] of [["beginning", 0], ["middle", Math.floor(rank.xpCap / 2)], ["end", rank.xpCap]]) {
    test(`${rank.tier} ${label} maps deterministically`, () => {
      const input = { tier: rank.tier, rankName: rank.name, xpCap: rank.xpCap, xp };
      const first = calculateF8MigrationProposal(input);
      const second = calculateF8MigrationProposal(input);
      assert.deepEqual(first, second);
      assert.equal(first.proposal.oldCumulativeJourneyXp, rankStart + xp);
    });
  }
  consumed += rank.xpCap;
}

for (const [cumulative, tier, activeXp] of newBoundaries) {
  test(`cumulative boundary ${cumulative} maps to ${tier}`, () => {
    const result = calculateF8MigrationProposal(inputForCumulative(cumulative));
    assert.equal(result.proposal.proposedTier, tier);
    assert.equal(result.proposal.proposedActiveXp, activeXp);
  });
}

test("XP below zero warns and clamps to zero", () => {
  const result = calculateF8MigrationProposal({ tier: "T2", rankName: "Contender", xpCap: 1000, xp: -5 });
  assert.equal(result.proposal.oldCumulativeJourneyXp, 1400);
  assert.ok(result.warnings.some(({ code }) => code === "NEGATIVE_XP"));
});

test("invalid XP warns and uses zero", () => {
  const result = calculateF8MigrationProposal({ tier: "T1", rankName: "Recruit", xp: "invalid" });
  assert.equal(result.proposal.oldCumulativeJourneyXp, 600);
  assert.ok(result.warnings.some(({ code }) => code === "INVALID_XP"));
});

test("XP above legacy cap warns and clamps", () => {
  const result = calculateF8MigrationProposal({ tier: "T1", rankName: "Recruit", xp: 5000 });
  assert.equal(result.proposal.oldCumulativeJourneyXp, 1400);
  assert.ok(result.warnings.some(({ code }) => code === "XP_OVER_LEGACY_CAP"));
});

test("unknown legacy tier fails closed without a proposal", () => {
  const result = calculateF8MigrationProposal({ tier: "T8", xp: 10 });
  assert.equal(result.proposal, null);
  assert.ok(result.warnings.some(({ code }) => code === "UNKNOWN_LEGACY_TIER"));
});

test("rank and tier mismatch is detected", () => {
  const result = calculateF8MigrationProposal({ tier: "T2", rankName: "Competitor", xp: 10 });
  assert.ok(result.warnings.some(({ code }) => code === "RANK_TIER_MISMATCH"));
});

test("proposed stripes use 25/50/75/100 thresholds", () => {
  const atStripeFour = calculateF8MigrationProposal(inputForCumulative(10800));
  assert.deepEqual(atStripeFour.proposal.proposedStripeThresholds, [800, 1600, 2400, 3200]);
  assert.equal(atStripeFour.proposal.proposedStripeCount, 4);
  const below = calculateF8MigrationProposal(inputForCumulative(10799));
  assert.equal(below.proposal.proposedStripeCount, 3);
});

test("explicit F8 evidence is accepted", () => {
  const result = classifyF8Candidate("athlete-1", { trackBase: "F8", programTrack: "zero2hero" });
  assert.equal(result.accepted, true);
  assert.equal(classifyF8Candidate("athlete-2", { trackBase: "F8", programTrack: "z2h" }).accepted, true);
});

test("F4 fixture is rejected", () => {
  const result = classifyF8Candidate("F4_ATHLETE", { trackBase: "F4", programTrack: "path2legend" });
  assert.equal(result.accepted, false);
});

test("ambiguous classification is rejected", () => {
  const result = classifyF8Candidate("F8_ATHLETE", { trackBase: "F4", programTrack: "zero2hero" });
  assert.equal(result.accepted, false);
  assert.equal(result.ambiguous, true);
});

test("review output is deterministic for the same input and context", () => {
  const athlete = { uid: "F8_TEST", trackBase: "F8", tier: "T0", rankName: "Shadow", xp: 200, xpCap: 600, stripeCount: 1 };
  const context = { nowMs: 0, logSummary: { xpLogs: { count: 1 }, xp_logs: { count: 0 } } };
  assert.deepEqual(buildF8MigrationReview("F8_TEST", athlete, context), buildF8MigrationReview("F8_TEST", athlete, context));
});
