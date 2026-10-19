import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { R2C_YOUTH_WRESTLING_PLACEMENTS } from "../../functions/lib/policy/youthWrestlingPlacementManifest.js";
import { R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK } from "../../public/assets/js/hybrid/youth/road2champion-wrestling-tier-wave-crosswalk.js";
import { resolveRoad2ChampionWrestlingTierWaves } from "../../public/assets/js/hybrid/youth/road2champion-wrestling-tier-wave-policy.js";
import {
  acceptedCardsForGroup,
  composeGroupPlanning,
  editableGroupPlanning,
} from "../../public/coaches/execution/session-builder/hybrid-planning-policy.js";

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const rankTiers = ["T0", "T1", "T2", "T3", "T4"];
const expectedWaveCounts = { T0: 9, T1: 10, T2: 21, T3: 18, T4: 24 };

function allTierCards(tier) {
  const placement = R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.tiers[tier];
  return [
    ...placement.foundations,
    ...Object.values(placement.waves).flat(),
  ];
}

test("generated crosswalk is versioned from the approved placement authority", () => {
  assert.equal(R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.version, "r2c-youth-wrestling-tier-waves-v1");
  assert.equal(R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.placementVersion, "r2c-youth-wrestling-placement-v1");
  assert.equal(R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.journey, "road2champion");
  assert.equal(R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.discipline, "wrestling");
  assert.equal(R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.evidenceEffect, "none");
});

test("all 121 approved cards resolve exactly once without title matching", () => {
  const generated = Object.keys(R2C_YOUTH_WRESTLING_TIER_WAVE_CROSSWALK.tiers)
    .flatMap(allTierCards);
  assert.equal(generated.length, 121);
  assert.equal(new Set(generated.map((card) => card.cardId)).size, 121);
  for (const entry of R2C_YOUTH_WRESTLING_PLACEMENTS) {
    const card = generated.find((candidate) => candidate.cardId === entry.cardId);
    assert.ok(card, entry.cardId);
    assert.equal(card.title, entry.skillTitle, entry.cardId);
    assert.equal(card.href, `/${entry.originalCardPath.replace(/^public\//, "")}`, entry.cardId);
    assert.equal(card.manifestFamilyId, entry.familyId, entry.cardId);
    assert.equal(
      card.familyId,
      entry.familyMappingStatus === "AUTHORITATIVE_EXISTING" ? entry.familyId : "",
      entry.cardId
    );
    assert.equal(card.familyMappingStatus, entry.familyMappingStatus, entry.cardId);
    assert.equal(card.progressionVerified, false, entry.cardId);
    assert.ok(existsSync(path.join(repo, entry.originalCardPath)), entry.originalCardPath);
  }
});

test("crosswalk preserves exact legacy foundation and wave membership", async () => {
  for (const entry of R2C_YOUTH_WRESTLING_PLACEMENTS) {
    const originalTier = entry.originalCurriculumTier.toLowerCase();
    const model = await import(pathToFileURL(path.join(
      repo,
      `public/assets/js/hybrid/youth/youth-zero-to-hero-wrestling-${originalTier}-waves.js`
    )));
    const slug = path.basename(entry.originalCardPath, ".html").replace(/^skill-\d+-/, "");
    const card = allTierCards(entry.placement).find((candidate) => candidate.cardId === entry.cardId);
    const waveMatches = Object.entries(model.SKILL_WAVES)
      .filter(([, slugs]) => slugs.includes(slug))
      .map(([wave]) => wave);
    const foundation = model.FOUNDATIONS.includes(slug);
    assert.equal(waveMatches.length + Number(foundation), 1, entry.cardId);
    assert.equal(card.legacySkillSlug, slug, entry.cardId);
    assert.equal(card.legacyWave, foundation ? "foundation" : waveMatches[0], entry.cardId);
  }
});

test("all five ranks expose only approved selectable wave cards and unsupported tiers fail closed", () => {
  for (const tier of rankTiers) {
    const resolved = resolveRoad2ChampionWrestlingTierWaves(tier.toLowerCase());
    assert.equal(resolved.tier, tier);
    const cards = Object.values(resolved.waves).flat();
    assert.equal(cards.length, expectedWaveCounts[tier], tier);
    assert.ok(cards.every((card) => card.tier === tier.toLowerCase()), tier);
    assert.ok(cards.every((card) => card.legacyWave !== "foundation"), tier);
  }
  assert.equal(resolveRoad2ChampionWrestlingTierWaves("T5"), null);
  assert.equal(resolveRoad2ChampionWrestlingTierWaves("CHAMPION_EXTENDED_DEVELOPMENT"), null);
  assert.equal(resolveRoad2ChampionWrestlingTierWaves("unknown"), null);
});

test("Tier Waves remain optional, group-specific, and Coach-accepted without progression effects", () => {
  const cardA = resolveRoad2ChampionWrestlingTierWaves("T0").waves.neutral_offense[0];
  const cardB = resolveRoad2ChampionWrestlingTierWaves("T2").waves.top_control[0];
  const off = composeGroupPlanning({ group: { id: "group-a", tier: "T0" }, sources: { tierWaves: false }, wave: { waveKey: "neutral_offense", cards: [cardA] } });
  const a = composeGroupPlanning({ group: { id: "group-a", tier: "T0" }, sources: { tierWaves: true }, wave: { waveKey: "neutral_offense", cards: [cardA] } });
  const b = composeGroupPlanning({ group: { id: "group-b", tier: "T2" }, sources: { tierWaves: true }, wave: { waveKey: "top_control", cards: [cardB] } });
  assert.deepEqual(acceptedCardsForGroup(off), []);
  assert.deepEqual(acceptedCardsForGroup(a).map((card) => card.cardId), [cardA.cardId]);
  assert.deepEqual(acceptedCardsForGroup(b).map((card) => card.cardId), [cardB.cardId]);
  assert.equal(a.tierWave.progressionVerified, false);
  assert.equal(b.tierWave.progressionVerified, false);
  assert.equal(a.systemSuggestion, null);
});

test("changing instructional tier invalidates an incompatible remembered wave selection", () => {
  const prior = composeGroupPlanning({
    group: { id: "group-a", tier: "T0" },
    sources: { tierWaves: true },
    wave: { waveKey: "neutral_offense", cards: [] },
  });
  assert.equal(editableGroupPlanning(prior, { tier: "T0" }).selectedWave, "neutral_offense");
  assert.equal(editableGroupPlanning(prior, { tier: "T2" }).selectedWave, "");
});

test("Session Builder wiring preserves system-suggestion, AUTO, and data-write safeguards", () => {
  const source = readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  assert.match(source, /resolveRoad2ChampionWrestlingTierWaves\(tier\)/);
  assert.match(source, /program\.programId !== "youth-z2h-wrestling"/);
  assert.match(source, /System Suggestions:<\/strong> unavailable until authoritative athlete-history recommendations are connected/);
  assert.match(source, /autoPendingVerification: true/);
  assert.match(source, /progressionVerified = false/);
  assert.doesNotMatch(source, /updateDoc|setDoc|promoteTier|issueCertificate/);
});
