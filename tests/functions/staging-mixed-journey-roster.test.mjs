import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("mixed-journey seed requires isolated staging authorization and transactional synthetic writes", async () => {
  const script = await read("functions/scripts/seed-mixed-journey-class-staging.mjs");
  assert.match(script, /verifyStagingBoundary\(\)/);
  assert.match(script, /assertSyntheticWriteSafety\(existing, existingPaths\)/);
  assert.match(script, /commitSyntheticManifestTransaction\(db, writes\)/);
  assert.doesNotMatch(script, /collection\(["']?(?:athletes|attendance_sessions)["']?\).*delete/);
  assert.doesNotMatch(script, /sandmandashboard/);
});

test("mixed-journey seed preserves original three and adds 12 R2C plus 9 P2L without awarding progression", async () => {
  const script = await read("functions/scripts/seed-mixed-journey-class-staging.mjs");
  for (const id of ["staging-athlete-beginner", "staging-athlete-intermediate", "staging-athlete-advanced"]) {
    assert.ok(script.includes(id));
  }
  assert.match(script, /scenarios\.filter\(a => a\.journey === "Z2H"\)\.length !== 12/);
  assert.match(script, /scenarios\.filter\(a => a\.journey === "P2L"\)\.length !== 9/);
  assert.match(script, /rosterIds\.length !== 24/);
  assert.match(script, /syntheticScenarioTier: athlete\.scenarioTier/);
  assert.doesNotMatch(script, /\b(?:progressionTier|rankName|xpAwarded):/);
  assert.doesNotMatch(script, /writes\.set\(`(?:practiceSessions|attendance_sessions)\//);
});

test("HYBRID attendance recognizes both seeded journeys and age profiles while retaining tier-evidence boundary", async () => {
  const script = await read("public/coaches/attendance/session.js");
  assert.match(script, /Z2H:\s*LADDER_YOUTH/);
  assert.match(script, /P2L:\s*LADDER_F4/);
  assert.match(script, /profileType === "youth"/);
  assert.match(script, /profileType === "teen"/);
  assert.match(script, /athlete\.progressionTier/);
  assert.doesNotMatch(script, /athlete\.syntheticScenarioTier/);
});
