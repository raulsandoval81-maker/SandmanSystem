import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ADDED_STAGING_ATHLETE_FIXTURES,
  ORIGINAL_STAGING_ATHLETE_IDS,
  canonicalSyntheticRank,
  syntheticTierDisplayPatch,
  validateSyntheticFixtureRecord,
} from "../../functions/scripts/staging-mixed-journey-tier-fixtures.mjs";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("21 added fixtures preserve the seeded tier distribution and all 24 identities", () => {
  assert.equal(ADDED_STAGING_ATHLETE_FIXTURES.length, 21);
  assert.equal(ORIGINAL_STAGING_ATHLETE_IDS.length, 3);
  assert.equal(new Set([...ORIGINAL_STAGING_ATHLETE_IDS, ...ADDED_STAGING_ATHLETE_FIXTURES.map(({ id }) => id)]).size, 24);
  assert.deepEqual(ADDED_STAGING_ATHLETE_FIXTURES.filter(({ journey }) => journey === "Z2H").map(({ tier }) => tier), ["T0", "T0", "T0", "T0", "T1", "T1", "T1", "T2", "T2", "T2", "T3", "T3"]);
  assert.deepEqual(ADDED_STAGING_ATHLETE_FIXTURES.filter(({ journey }) => journey === "P2L").map(({ tier }) => tier), ["T0", "T0", "T0", "T1", "T1", "T2", "T2", "T3", "T4"]);
});

test("canonical display ranks come from the existing R2C and P2L ladders", () => {
  assert.deepEqual(["T0", "T1", "T2", "T3", "T4"].map((tier) => canonicalSyntheticRank("Z2H", tier)), ["Shadow", "Prospect", "Competitor", "Contender", "Champion"]);
  assert.deepEqual(["T0", "T1", "T2", "T3", "T4"].map((tier) => canonicalSyntheticRank("P2L", tier)), ["Apprentice", "Warrior", "Hero", "Veteran", "Legend"]);
});

test("display patches are explicit synthetic placements without progression evidence", () => {
  const fixture = ADDED_STAGING_ATHLETE_FIXTURES.find(({ journey, tier }) => journey === "P2L" && tier === "T2");
  const patch = syntheticTierDisplayPatch(fixture);
  assert.deepEqual(patch, {
    tier: "T2", rank: "Hero", syntheticPlacement: true,
    syntheticPlacementCertified: false,
    syntheticPlacementSource: "mixed-journey-scenario-tier-v1",
  });
  for (const field of ["progressionTier", "curriculumTier", "rankName", "xp", "xpCap", "stripeCount", "verifiedSkills", "testing", "certificates", "promotionHistory"]) {
    assert.equal(Object.hasOwn(patch, field), false);
  }
});

test("record validation is idempotent and rejects identity or placement conflicts", () => {
  const fixture = ADDED_STAGING_ATHLETE_FIXTURES[0];
  const base = { synthetic: true, syntheticDataOnly: true, journey: fixture.journey, syntheticScenarioTier: fixture.tier, locationId: "santa-ynez-valley", discipline: "wrestling" };
  const patch = validateSyntheticFixtureRecord(base, fixture);
  assert.deepEqual(validateSyntheticFixtureRecord({ ...base, ...patch }, fixture), patch);
  assert.throws(() => validateSyntheticFixtureRecord({ ...base, tier: "T4" }, fixture), /conflicting tier/);
  assert.throws(() => validateSyntheticFixtureRecord({ ...base, journey: "P2L" }, fixture), /identity has drifted/);
  assert.throws(() => validateSyntheticFixtureRecord({ ...base, synthetic: false }, fixture), /not an isolated synthetic/);
});

test("dedicated backfill is staging guarded, update-only, and preserves originals", async () => {
  const script = await read("functions/scripts/backfill-mixed-journey-tier-display-staging.mjs");
  assert.match(script, /verifyStagingBoundary\(\)/);
  assert.match(script, /BACKFILL-21-SYNTHETIC-TIERS/);
  assert.match(script, /Synthetic backfill target does not exist/);
  assert.match(script, /originalUpdateTimes/);
  assert.match(script, /patches\.size/);
  assert.ok((script.match(/assertNoProgressionEvidence\(/g) || []).length >= 3);
  assert.match(script, /transaction\.set\(snap\.ref, patches\.get\(snap\.ref\.path\), \{ merge: true \}\)/);
  assert.doesNotMatch(script, /transaction\.(?:create|delete)/);
  assert.doesNotMatch(script, /sandmandashboard/);
});

test("trusted workflow selects the backfill without blindly rerunning the seed", async () => {
  const workflow = await read(".github/workflows/seed-mixed-journey-staging-roster.yml");
  assert.match(workflow, /backfill-tier-display/);
  assert.match(workflow, /BACKFILL-21-SYNTHETIC-TIERS/);
  assert.match(workflow, /if: inputs\.operation == 'seed-roster'/);
  assert.match(workflow, /if: inputs\.operation == 'backfill-tier-display'/);
  assert.equal((workflow.match(/node functions\/scripts\/seed-mixed-journey-class-staging\.mjs/g) || []).length, 1);
  assert.equal((workflow.match(/node functions\/scripts\/backfill-mixed-journey-tier-display-staging\.mjs/g) || []).length, 1);
});

test("checked-in practice snapshots require refresh after document backfill", async () => {
  const server = await read("functions/src/practice/practiceSessions.ts");
  const browser = await read("public/coaches/attendance/session.js");
  assert.match(server, /tier: athlete\.tier \|\| "", rank: athlete\.rank \|\| ""/);
  assert.match(browser, /athletes\.find\(\(athlete\).*\|\| checked/s);
  assert.match(browser, /getDocs\(collection\(db, "athletes"\)\)/);
});
