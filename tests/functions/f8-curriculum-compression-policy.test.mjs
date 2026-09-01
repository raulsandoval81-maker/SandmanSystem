import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  F8_CURRICULUM_COMPRESSION_POLICY,
  F8_CURRICULUM_COMPRESSION_VERSION,
  F8_CURRICULUM_CONTENT_ROLES,
  isF8CurriculumBridgeStage,
  isF8CurriculumCompressionSupported,
  isF8LegacyCurriculumIdentifier,
  isLegacyF8CurriculumRouteValid,
  resolveF8CurriculumCompressionMetadata,
  resolveF8CurriculumStageMetadata,
  resolveRoad2ChampionRankContainer,
} from "../../functions/lib/policy/f8CurriculumCompressionPolicy.js";
import { F8_CURRICULUM_TIERS } from "../../functions/lib/policy/f8CurriculumCompatibilityPolicy.js";
import { F8_RANKS } from "../../functions/lib/policy/f8ProgressionPolicy.js";

const disciplines = ["wrestling", "boxing", "kickboxing"];

test("policy is versioned, immutable, and preserves independent tier domains", () => {
  assert.equal(F8_CURRICULUM_COMPRESSION_VERSION, "f8-road2champion-curriculum-compression-v1");
  assert.ok(Object.isFrozen(F8_CURRICULUM_COMPRESSION_POLICY));
  assert.deepEqual(F8_RANKS.map((rank) => rank.name), [
    "Shadow", "Prospect", "Competitor", "Contender", "Champion",
  ]);
  assert.deepEqual(F8_CURRICULUM_COMPRESSION_POLICY.progressionTiers, ["T0", "T1", "T2", "T3", "T4"]);
  assert.deepEqual([...F8_CURRICULUM_TIERS], ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"]);
  assert.deepEqual(F8_CURRICULUM_COMPRESSION_POLICY.curriculumTiers, F8_CURRICULUM_TIERS);
  assert.deepEqual([...F8_CURRICULUM_CONTENT_ROLES], ["foundation", "development", "bridge", "review", "mastery"]);
});

for (const discipline of disciplines) {
  test(`${discipline} implements the approved eight-stage to five-rank mapping`, () => {
    assert.equal(isF8CurriculumCompressionSupported(discipline), true);
    assert.equal(resolveF8CurriculumCompressionMetadata(discipline).length, 8);
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T0"), "T0");
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T1"), "T1");
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T2"), null);
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T2", "foundation"), "T1");
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T2", "application"), "T2");
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T3"), "T2");
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T4"), "T3");
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T5"), null);
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T5", "development"), "T3");
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T5", "champion-preparation"), "T4");
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T6"), "T4");
    assert.equal(resolveRoad2ChampionRankContainer(discipline, "T7"), "T4");
  });
}

test("T2 and T5 are explicit bridge stages that require future card metadata", () => {
  for (const discipline of disciplines) {
    for (const tier of ["T2", "T5"]) {
      const stage = resolveF8CurriculumStageMetadata(discipline, tier);
      assert.equal(isF8CurriculumBridgeStage(discipline, tier), true);
      assert.equal(stage.requiresCardMetadata, true);
      assert.equal(stage.rankTiers.length, 2);
      assert.ok(stage.roles.includes("bridge"));
    }
    assert.equal(isF8CurriculumBridgeStage(discipline, "T3"), false);
  }
});

test("Muay Thai is implemented through the legacy kickboxing compatibility key", () => {
  for (const discipline of ["muay thai", "kickboxing"]) {
    assert.equal(isF8CurriculumCompressionSupported(discipline), true);
    assert.equal(resolveF8CurriculumCompressionMetadata(discipline).length, 8);
    for (const tier of F8_CURRICULUM_TIERS) {
      assert.equal(isLegacyF8CurriculumRouteValid(discipline, tier), true);
    }
  }
});

test("legacy Foundry 8 identifiers remain compatibility aliases", () => {
  for (const identifier of ["F8", "Foundry8", "foundry-8", "youth", "z2h", "zero2hero"]) {
    assert.equal(isF8LegacyCurriculumIdentifier(identifier), true);
  }
  assert.equal(isF8LegacyCurriculumIdentifier("path2legend"), false);
});

test("every existing T0-T7 Wrestling, Boxing, and kickboxing route remains valid", () => {
  for (const discipline of ["wrestling", "boxing", "kickboxing"]) {
    for (let index = 0; index <= 7; index += 1) {
      const tier = `T${index}`;
      assert.equal(isLegacyF8CurriculumRouteValid(discipline, tier), true);
      assert.ok(existsSync(`public/athletes/arsenal/combat/z2h/${discipline}/study/skilltree-${index}.html`));
      assert.ok(existsSync(`public/athletes/arsenal/combat/z2h/${discipline}/train/t${index}.html`));
    }
  }
});

test("compression policy is pure metadata and cannot change XP, stripes, promotion, or routing", () => {
  const source = readFileSync("functions/src/policy/f8CurriculumCompressionPolicy.ts", "utf8");
  assert.doesNotMatch(source, /firebase|firestore|HttpsError|runTransaction|\.update\(|\.set\(|athlete\?\.xp|stripeCount|promoteTier/);
  assert.doesNotMatch(source, /progressionTier\s*:/);

  const lockSource = readFileSync("public/assets/js/combat-lock.js", "utf8");
  assert.match(lockSource, /athlete\.curriculumTier \|\|/);
  assert.match(lockSource, /"T5",\s*"T6",\s*"T7"/);
});
