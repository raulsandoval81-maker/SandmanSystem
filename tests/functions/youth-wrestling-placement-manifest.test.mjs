import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  CHAMPION_EXTENDED_DEVELOPMENT,
  R2C_YOUTH_WRESTLING_APPROVED_COUNTS,
  R2C_YOUTH_WRESTLING_PLACEMENT_MANIFEST,
  R2C_YOUTH_WRESTLING_PLACEMENTS,
  R2C_YOUTH_WRESTLING_PLACEMENT_VERSION,
} from "../../functions/lib/policy/youthWrestlingPlacementManifest.js";
import { F8_CURRICULUM_TIERS } from "../../functions/lib/policy/f8CurriculumCompatibilityPolicy.js";
import {
  F8_POLICY_VERSION,
  F8_RANKS,
  F8_TOTAL_JOURNEY_XP,
} from "../../functions/lib/policy/f8ProgressionPolicy.js";

const expectedCounts = {
  T0: 14,
  T1: 14,
  T2: 23,
  T3: 26,
  T4: 30,
  CHAMPION_EXTENDED_DEVELOPMENT: 14,
};

test("Youth Wrestling placement manifest is versioned and immutable", () => {
  assert.equal(
    R2C_YOUTH_WRESTLING_PLACEMENT_VERSION,
    "r2c-youth-wrestling-placement-v1"
  );
  assert.equal(
    R2C_YOUTH_WRESTLING_PLACEMENT_MANIFEST.version,
    R2C_YOUTH_WRESTLING_PLACEMENT_VERSION
  );
  assert.equal(R2C_YOUTH_WRESTLING_PLACEMENT_MANIFEST.discipline, "wrestling");
  assert.equal(R2C_YOUTH_WRESTLING_PLACEMENT_MANIFEST.journey, "road2champion");
  assert.ok(Object.isFrozen(R2C_YOUTH_WRESTLING_PLACEMENT_MANIFEST));
  assert.ok(Object.isFrozen(R2C_YOUTH_WRESTLING_PLACEMENTS));
  assert.ok(R2C_YOUTH_WRESTLING_PLACEMENTS.every(Object.isFrozen));
});

test("manifest has exactly 121 unique card IDs and primary card paths", () => {
  assert.equal(R2C_YOUTH_WRESTLING_PLACEMENTS.length, 121);
  assert.equal(
    new Set(R2C_YOUTH_WRESTLING_PLACEMENTS.map((entry) => entry.cardId)).size,
    121
  );
  assert.equal(
    new Set(R2C_YOUTH_WRESTLING_PLACEMENTS.map((entry) => entry.originalCardPath)).size,
    121
  );
});

test("approved placement totals are exact and sum to 121", () => {
  assert.deepEqual(R2C_YOUTH_WRESTLING_APPROVED_COUNTS, expectedCounts);
  const actual = Object.fromEntries(
    Object.keys(expectedCounts).map((placement) => [
      placement,
      R2C_YOUTH_WRESTLING_PLACEMENTS.filter(
        (entry) => entry.placement === placement
      ).length,
    ])
  );
  assert.deepEqual(actual, expectedCounts);
  assert.equal(Object.values(actual).reduce((sum, count) => sum + count, 0), 121);
});

test("every manifest entry resolves to its unchanged Coach Card ID, title, and tier path", () => {
  for (const entry of R2C_YOUTH_WRESTLING_PLACEMENTS) {
    assert.ok(existsSync(entry.originalCardPath), entry.originalCardPath);
    const source = readFileSync(entry.originalCardPath, "utf8");
    const sourceId = source.match(/data-id="([^"]+)"/)?.[1] || "";
    const sourceTitle = (source.match(
      /<h2>Skill(?:\s+\d+)?\s+—\s+([^<]+)<\/h2>/
    )?.[1] || "").replaceAll("&amp;", "&").trim();
    assert.equal(sourceId, entry.cardId, entry.originalCardPath);
    assert.equal(sourceTitle, entry.skillTitle, entry.cardId);
    assert.match(
      entry.originalCardPath,
      new RegExp(`/z2h-wrestling/${entry.originalCurriculumTier.toLowerCase()}/`)
    );
  }
});

test("existing T0-T4 families remain authoritative and T5-T7 mappings remain explicit unresolved inferences", async () => {
  const familySource = readFileSync(
    "public/coaches/cards/wrestling/family-map.js",
    "utf8"
  );
  const familyModule = await import(
    `data:text/javascript;base64,${Buffer.from(familySource).toString("base64")}`
  );
  const currentMap = familyModule.WRESTLING_CARD_FAMILIES.r2c;
  const knownFamilies = familyModule.WRESTLING_FAMILIES;

  const authoritative = R2C_YOUTH_WRESTLING_PLACEMENTS.filter(
    (entry) => entry.familyMappingStatus === "AUTHORITATIVE_EXISTING"
  );
  const unresolved = R2C_YOUTH_WRESTLING_PLACEMENTS.filter(
    (entry) => entry.familyMappingStatus === "INFERRED_UNRESOLVED"
  );
  assert.equal(authoritative.length, 66);
  assert.equal(unresolved.length, 55);

  for (const entry of authoritative) {
    assert.ok(["T0", "T1", "T2", "T3", "T4"].includes(entry.originalCurriculumTier));
    const tier = entry.originalCurriculumTier.toLowerCase();
    const slug = path.basename(entry.originalCardPath, ".html").replace(/^skill-\d+-/, "");
    assert.equal(currentMap[tier]?.[slug], entry.familyId, entry.cardId);
  }
  for (const entry of unresolved) {
    assert.ok(["T5", "T6", "T7"].includes(entry.originalCurriculumTier));
    assert.ok(entry.familyId in knownFamilies, entry.cardId);
  }
});

test("Champion Extended Development is isolated from required rank curriculum", () => {
  for (const entry of R2C_YOUTH_WRESTLING_PLACEMENTS) {
    if (entry.placement === CHAMPION_EXTENDED_DEVELOPMENT) {
      assert.equal(entry.curriculumStatus, "EXTENSION");
    } else {
      assert.ok(["T0", "T1", "T2", "T3", "T4"].includes(entry.placement));
      assert.equal(entry.curriculumStatus, "REQUIRED");
    }
  }
});

test("legacy curriculum tiers remain independent from five progression ranks", () => {
  assert.deepEqual(
    [...F8_CURRICULUM_TIERS],
    ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"]
  );
  assert.deepEqual(
    F8_RANKS.map(({ tier, name }) => `${tier} ${name}`),
    ["T0 Shadow", "T1 Prospect", "T2 Competitor", "T3 Contender", "T4 Champion"]
  );
  assert.ok(
    R2C_YOUTH_WRESTLING_PLACEMENTS.some(
      (entry) => entry.originalCurriculumTier === "T7" && entry.placement === "T4"
    )
  );
});

test("rank names, XP caps, and total journey XP remain unchanged", () => {
  assert.equal(F8_POLICY_VERSION, "f8-road2champion-v2");
  assert.deepEqual(
    F8_RANKS.map(({ name, xpCap }) => ({ name, xpCap })),
    [
      { name: "Shadow", xpCap: 800 },
      { name: "Prospect", xpCap: 1600 },
      { name: "Competitor", xpCap: 2400 },
      { name: "Contender", xpCap: 2800 },
      { name: "Champion", xpCap: 3200 },
    ]
  );
  assert.equal(F8_TOTAL_JOURNEY_XP, 10800);
});

test("Phase 1 manifest remains metadata-only with no athlete, certification, XP, HYBRID, or AUTO consumer", () => {
  const source = readFileSync(
    "functions/src/policy/youthWrestlingPlacementManifest.ts",
    "utf8"
  );
  assert.doesNotMatch(
    source,
    /firebase|firestore|runTransaction|\.update\(|\.set\(|promoteTier|issueCertificate|eligibleForAuto\s*:\s*true/
  );
  assert.doesNotMatch(source, /athlete\??\.|verifiedSkills|progressionTier\s*:/);
});
