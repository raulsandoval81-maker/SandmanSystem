import { LADDER_F4, LADDER_YOUTH } from "../../public/assets/js/ladder.service.js";

export const ORIGINAL_STAGING_ATHLETE_IDS = Object.freeze([
  "staging-athlete-beginner",
  "staging-athlete-intermediate",
  "staging-athlete-advanced",
]);

const R2C_TIERS = Object.freeze(["T0", "T0", "T0", "T0", "T1", "T1", "T1", "T2", "T2", "T2", "T3", "T3"]);
const P2L_TIERS = Object.freeze(["T0", "T0", "T0", "T1", "T1", "T2", "T2", "T3", "T4"]);

export const ADDED_STAGING_ATHLETE_FIXTURES = Object.freeze([
  ...R2C_TIERS.map((tier, index) => Object.freeze({
    id: `staging-r2c-class-${String(index + 1).padStart(2, "0")}`,
    journey: "Z2H",
    tier,
  })),
  ...P2L_TIERS.map((tier, index) => Object.freeze({
    id: `staging-p2l-class-${String(index + 1).padStart(2, "0")}`,
    journey: "P2L",
    tier,
  })),
]);

function rankFromLadder(ladder, tier) {
  return ladder.find((entry) => String(entry.key).replace(/^R/, "T") === tier)?.name || "";
}

export function canonicalSyntheticRank(journey, tier) {
  const ladder = journey === "Z2H" ? LADDER_YOUTH : journey === "P2L" ? LADDER_F4 : [];
  const rank = rankFromLadder(ladder, tier);
  if (!rank) throw new Error(`No canonical synthetic rank for ${journey} ${tier}.`);
  return rank;
}

export function syntheticTierDisplayPatch(fixture) {
  return Object.freeze({
    tier: fixture.tier,
    rank: canonicalSyntheticRank(fixture.journey, fixture.tier),
    syntheticPlacement: true,
    syntheticPlacementCertified: false,
    syntheticPlacementSource: "mixed-journey-scenario-tier-v1",
  });
}

export function validateSyntheticFixtureRecord(record, fixture) {
  if (record?.synthetic !== true || record?.syntheticDataOnly !== true) throw new Error(`${fixture.id} is not an isolated synthetic record.`);
  if (record?.journey !== fixture.journey || record?.syntheticScenarioTier !== fixture.tier) throw new Error(`${fixture.id} scenario identity has drifted.`);
  if (record?.locationId !== "santa-ynez-valley" || record?.discipline !== "wrestling") throw new Error(`${fixture.id} staging boundary has drifted.`);
  const expected = syntheticTierDisplayPatch(fixture);
  if (record?.tier && record.tier !== expected.tier) throw new Error(`${fixture.id} has a conflicting tier.`);
  if (record?.rank && record.rank !== expected.rank) throw new Error(`${fixture.id} has a conflicting rank.`);
  return expected;
}
