import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { BOXING_CARD_FAMILIES } from "../../public/coaches/cards/boxing/family-map.js";
import { MUAY_THAI_CARD_FAMILIES } from "../../public/coaches/cards/muay-thai/family-map.js";
import { familyProgressById, groupPlacements, progressPresentation, resolveSkillTreeTiers } from "../../public/assets/js/youth-simplified-skill-tree-policy.js";
import { R2C_YOUTH_BOXING_APPROVED_COUNTS, R2C_YOUTH_BOXING_PLACEMENTS, R2C_YOUTH_BOXING_PLACEMENT_VERSION } from "../../functions/lib/policy/youthBoxingPlacementManifest.js";
import { R2C_YOUTH_MUAY_THAI_APPROVED_COUNTS, R2C_YOUTH_MUAY_THAI_PLACEMENTS, R2C_YOUTH_MUAY_THAI_PLACEMENT_VERSION } from "../../functions/lib/policy/youthMuayThaiPlacementManifest.js";

const boxingBrowser = JSON.parse(readFileSync("public/assets/data/youth-boxing-placement-manifest.json", "utf8"));
const muayThaiBrowser = JSON.parse(readFileSync("public/assets/data/youth-muay-thai-placement-manifest.json", "utf8"));
const projection = (entries) => entries.map(({ cardId, originalCurriculumTier, placement, skillTitle, familyId, familyMappingStatus, curriculumStatus }) => ({ cardId, originalCurriculumTier, placement, skillTitle, familyId, familyMappingStatus, curriculumStatus }));

const specifications = [
  { name: "Boxing", entries: R2C_YOUTH_BOXING_PLACEMENTS, counts: R2C_YOUTH_BOXING_APPROVED_COUNTS, version: R2C_YOUTH_BOXING_PLACEMENT_VERSION, browser: boxingBrowser, families: BOXING_CARD_FAMILIES.r2c },
  { name: "Muay Thai", entries: R2C_YOUTH_MUAY_THAI_PLACEMENTS, counts: R2C_YOUTH_MUAY_THAI_APPROVED_COUNTS, version: R2C_YOUTH_MUAY_THAI_PLACEMENT_VERSION, browser: muayThaiBrowser, families: MUAY_THAI_CARD_FAMILIES.r2c },
];

for (const specification of specifications) {
  test(`${specification.name} manifest has 121 unique IDs and accepted totals`, () => {
    assert.equal(specification.entries.length, 121);
    assert.equal(new Set(specification.entries.map(({ cardId }) => cardId)).size, 121);
    assert.deepEqual(Object.fromEntries(groupPlacements(specification.entries).map(({ placement, skills }) => [placement, skills.length])), specification.counts);
  });

  test(`${specification.name} browser projection exactly matches its authoritative manifest`, () => {
    assert.equal(specification.browser.version, specification.version);
    assert.deepEqual(specification.browser.approvedCounts, specification.counts);
    assert.deepEqual(specification.browser.placements, projection(specification.entries));
  });

  test(`${specification.name} IDs, titles, paths, tiers, and families match Coach Cards`, () => {
    for (const entry of specification.entries) {
      const source = readFileSync(entry.originalCardPath, "utf8");
      assert.match(source, new RegExp(`data-id=["']${entry.cardId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
      const slug = entry.originalCardPath.match(/skill-\d+-(.+)\.html$/)?.[1];
      const tier = entry.originalCurriculumTier.toLowerCase();
      assert.equal(specification.families[tier]?.[slug], entry.familyId);
      const sourceTitle = source.match(/data-title="([^"]+)"/)?.[1]?.replace(/^Road2Champion Muay Thai T\d+\s*—\s*/, "");
      assert.equal(sourceTitle, entry.skillTitle);
    }
  });
}

test("Boxing preserves the Hero Evaluation ID with the Coach Card's Extension Evaluation title", () => {
  const evaluation = R2C_YOUTH_BOXING_PLACEMENTS.find(({ cardId }) => cardId === "youth-boxing-t7-hero-evaluation");
  assert.equal(evaluation?.skillTitle, "Extension Evaluation");
  assert.match(readFileSync(evaluation.originalCardPath, "utf8"), /data-title="Extension Evaluation"/);
  assert.match(readFileSync("public/athletes/arsenal/combat/z2h/boxing/study/skilltree-7.html", "utf8"), /Extension Evaluation/);
});

test("family progress remains related evidence and never exact-card verification", () => {
  const entry = R2C_YOUTH_BOXING_PLACEMENTS.find(({ familyId }) => familyId === "jab_system");
  const progress = progressPresentation(entry, familyProgressById([{ familyId: "jab_system", state: "MASTERED" }]));
  assert.deepEqual(progress, { exactState: "Exact skill status unknown", relatedState: "Related skill family: Mastered" });
  assert.doesNotMatch(progress.exactState, /verified|mastered/i);
});

test("discipline evidence and Muay Thai route normalization are explicit", () => {
  const boxing = readFileSync("public/athletes/arsenal/combat/z2h/boxing/study/youth-boxing-skill-tree.js", "utf8");
  const muayThai = readFileSync("public/athletes/arsenal/combat/z2h/kickboxing/study/youth-muay-thai-skill-tree.js", "utf8");
  assert.match(boxing, /evidenceDiscipline:\s*"boxing"/);
  assert.match(muayThai, /evidenceDiscipline:\s*"muay-thai"/);
  assert.match(muayThai, /kickboxing/);
});

test("discipline-specific access does not inherit another discipline's tier", () => {
  const athlete = { progressionTier: "T4", curriculumTier: "T7", disciplines: { wrestling: { tier: "T4" }, boxing: { progressionTier: "T1", curriculumTier: "T2" } } };
  assert.deepEqual(resolveSkillTreeTiers(athlete, ["boxing"]), { progressionTier: "T1", curriculumTier: "T2" });
  assert.deepEqual(resolveSkillTreeTiers(athlete, ["muay-thai", "kickboxing"]), { progressionTier: "T0", curriculumTier: "T0" });
});

test("simplified links coexist with all legacy T0-T7 routes and guards", () => {
  assert.match(readFileSync("public/athletes/arsenal/combat/z2h/boxing/index.html", "utf8"), /boxing\/study\/skilltree\.html/);
  assert.equal((readFileSync("public/athletes/arsenal/combat/z2h/kickboxing/index.html", "utf8").match(/kickboxing\/study\/skilltree\.html/g) || []).length, 8);
  for (const discipline of ["boxing", "kickboxing"]) for (let tier = 0; tier <= 7; tier += 1) {
    const legacy = readFileSync(`public/athletes/arsenal/combat/z2h/${discipline}/study/skilltree-${tier}.html`, "utf8");
    assert.match(legacy, new RegExp(`T${tier}`));
  }
  const shared = readFileSync("public/assets/js/youth-simplified-skill-tree.js", "utf8");
  assert.match(shared, /F4_/);
  assert.match(shared, /CHAMPION_EXTENDED_DEVELOPMENT/);
});

test("presentation remains read-only and leaves execution authority untouched", () => {
  const sources = [
    "public/assets/js/youth-simplified-skill-tree.js",
    "public/assets/js/youth-simplified-skill-tree-policy.js",
    "public/athletes/arsenal/combat/z2h/boxing/study/youth-boxing-skill-tree.js",
    "public/athletes/arsenal/combat/z2h/kickboxing/study/youth-muay-thai-skill-tree.js",
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(sources, /updateDoc|setDoc|runTransaction|promoteTier|issueCertificate|eligibleForAuto|executionMode\s*=/);
  assert.doesNotMatch(sources, /A\s+—|B\s+—|C\s+—/);
});
