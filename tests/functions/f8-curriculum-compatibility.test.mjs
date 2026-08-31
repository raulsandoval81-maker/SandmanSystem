import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  F8_CURRICULUM_COMPATIBILITY_VERSION,
  F8_CURRICULUM_TIERS,
  inspectF8TierCompatibility,
  resolveF8CurriculumTier,
  resolveF8ProgressionTier,
} from "../../functions/lib/policy/f8CurriculumCompatibilityPolicy.js";
import { resolveF8RankMetadata } from "../../functions/lib/policy/f8ProgressionPolicy.js";

const promotionSource = readFileSync("functions/src/modules/promotion/promoteTierAction.ts", "utf8");
const lockSource = readFileSync("public/assets/js/combat-lock.js", "utf8");
const intakeSource = readFileSync("functions/src/modules/createCoachAthleteCall.ts", "utf8");

test("bridge is versioned and F8 progressionTier resolves only five-rank policy tiers", () => {
  assert.equal(F8_CURRICULUM_COMPATIBILITY_VERSION, "f8-curriculum-bridge-v1");
  for (const tier of ["T0", "T1", "T2", "T3", "T4"]) {
    assert.equal(resolveF8ProgressionTier({ progressionTier: tier, tier }), tier);
    assert.equal(resolveF8RankMetadata(tier).tier, tier);
  }
});

test("curriculumTier remains independently valid through T7", () => {
  assert.deepEqual([...F8_CURRICULUM_TIERS], ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"]);
  for (const curriculumTier of F8_CURRICULUM_TIERS) {
    assert.equal(resolveF8CurriculumTier({ progressionTier: "T2", tier: "T2", curriculumTier }), curriculumTier);
  }
});

test("legacy-only F8 tier is readable without mutation", () => {
  const athlete = { tier: "T7", rankName: "Hero", lessonCompletions: { original: true } };
  const before = structuredClone(athlete);
  assert.deepEqual(inspectF8TierCompatibility(athlete), {
    version: "f8-curriculum-bridge-v1", state: "LEGACY_READ_ONLY",
    progressionTier: null, curriculumTier: "T7", legacyTier: "T7", warnings: [],
  });
  assert.deepEqual(athlete, before);
});

test("ambiguous legacy progression and conflicting explicit evidence fail closed", () => {
  assert.throws(() => resolveF8ProgressionTier({ tier: "T2", rankName: "Contender" }),
    /F8_PROGRESSION_TIER_REVIEW_REQUIRED/);
  const conflict = inspectF8TierCompatibility({ progressionTier: "T1", tier: "T2", curriculumTier: "T6" });
  assert.equal(conflict.state, "REVIEW_REQUIRED");
  assert.ok(conflict.warnings.includes("PROGRESSION_LEGACY_TIER_CONFLICT"));
  assert.throws(() => resolveF8ProgressionTier({ progressionTier: "T1", tier: "T2" }),
    /PROGRESSION_LEGACY_TIER_CONFLICT/);
});

test("promotion advances progression while preserving curriculum routing", () => {
  assert.match(promotionSource, /progressionTier: transition\.next\.tier/);
  assert.match(promotionSource, /curriculumTier,/);
  assert.match(promotionSource, /curriculumVersion: F8_CURRICULUM_COMPATIBILITY_VERSION/);
  assert.doesNotMatch(promotionSource, /curriculumTier: transition\.next\.tier/);
});

test("curriculum routing prefers curriculumTier and trainer guards preserve T5-T7", () => {
  assert.match(lockSource, /athlete\.curriculumTier \|\|\s*athlete\.tier/);
  for (let tier = 0; tier <= 7; tier += 1) {
    const path = `public/athletes/arsenal/combat/z2h/wrestling/train/t${tier}.html`;
    assert.ok(existsSync(path));
    assert.match(readFileSync(path, "utf8"), /athlete\.curriculumTier \|\| athlete\.tier/);
  }
});

test("curriculum fields cannot reconstruct XP or progression", () => {
  const source = readFileSync("functions/src/policy/f8CurriculumCompatibilityPolicy.ts", "utf8");
  assert.doesNotMatch(source, /athlete\?\.xp|xpDaily|xpArena|xpStrength|xpHonor/);
  assert.throws(() => resolveF8ProgressionTier({ curriculumTier: "T4", tier: "T7" }),
    /F8_PROGRESSION_TIER_REVIEW_REQUIRED/);
});

test("new F8 intake initializes explicit independent tiers without changing F4", () => {
  assert.match(intakeSource, /\.\.\.\(isF8 \? \{[\s\S]*progressionTier: "T0",[\s\S]*curriculumTier: "T0"/);
  assert.match(intakeSource, /\} : \{\}\)/);
  assert.match(intakeSource, /xpCap:\s*isF8\s*\? 800\s*: 1000/);
});

test("lesson and card completion identifiers are outside the bridge", () => {
  const policy = readFileSync("functions/src/policy/f8CurriculumCompatibilityPolicy.ts", "utf8");
  const promotion = promotionSource;
  assert.doesNotMatch(policy + promotion, /lessonCompletions|cardCompletions|completedSkills|skillId|cardId/);
});

test("F4 promotion remains on its existing generic tier behavior", () => {
  assert.match(promotionSource, /base === "F8" \? resolveF8ProgressionTier\(athlete\) : athleteTier\(athlete, base\)/);
  assert.match(promotionSource, /\.\.\.\(base === "F8" \? \{/);
});
