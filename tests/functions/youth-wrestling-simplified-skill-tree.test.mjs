import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  canViewPlacement,
  familyProgressById,
  groupPlacements,
  progressPresentation,
} from "../../public/athletes/arsenal/combat/z2h/wrestling/study/youth-wrestling-skill-tree-policy.js";
import {
  R2C_YOUTH_WRESTLING_APPROVED_COUNTS,
  R2C_YOUTH_WRESTLING_PLACEMENTS,
  R2C_YOUTH_WRESTLING_PLACEMENT_VERSION,
} from "../../functions/lib/policy/youthWrestlingPlacementManifest.js";

const browserManifest = JSON.parse(readFileSync(
  "public/assets/data/youth-wrestling-placement-manifest.json",
  "utf8"
));

test("browser projection exactly matches the authoritative server manifest", () => {
  assert.equal(browserManifest.version, R2C_YOUTH_WRESTLING_PLACEMENT_VERSION);
  assert.deepEqual(browserManifest.approvedCounts, R2C_YOUTH_WRESTLING_APPROVED_COUNTS);
  assert.deepEqual(browserManifest.placements, R2C_YOUTH_WRESTLING_PLACEMENTS.map((entry) => ({
    cardId: entry.cardId,
    originalCurriculumTier: entry.originalCurriculumTier,
    placement: entry.placement,
    skillTitle: entry.skillTitle,
    familyId: entry.familyId,
    familyMappingStatus: entry.familyMappingStatus,
    curriculumStatus: entry.curriculumStatus,
  })));
});

test("simplified tree has 121 unique IDs and exact approved rank totals", () => {
  assert.equal(browserManifest.placements.length, 121);
  assert.equal(new Set(browserManifest.placements.map(({ cardId }) => cardId)).size, 121);
  const groups = groupPlacements(browserManifest.placements);
  assert.deepEqual(
    Object.fromEntries(groups.map(({ placement, skills }) => [placement, skills.length])),
    R2C_YOUTH_WRESTLING_APPROVED_COUNTS
  );
});

test("family progress never becomes an exact-card verified state", () => {
  const entry = browserManifest.placements.find(({ familyId }) => familyId === "double_leg");
  const familyProgress = familyProgressById([{ familyId: "double_leg", state: "MASTERED" }]);
  assert.deepEqual(progressPresentation(entry, familyProgress), {
    exactState: "Exact skill status unknown",
    relatedState: "Related skill family: Mastered",
  });
  assert.doesNotMatch(progressPresentation(entry, familyProgress).exactState, /verified|mastered/i);
});

test("rank visibility follows five-rank progression while extensions preserve legacy T7 access", () => {
  assert.equal(canViewPlacement("T0", "T0", "T0"), true);
  assert.equal(canViewPlacement("T1", "T0", "T7"), false);
  assert.equal(canViewPlacement("T4", "T4", "T4"), true);
  assert.equal(canViewPlacement("T4", "T7", "T7"), true);
  assert.equal(canViewPlacement("CHAMPION_EXTENDED_DEVELOPMENT", "T4", "T6"), false);
  assert.equal(canViewPlacement("CHAMPION_EXTENDED_DEVELOPMENT", "T4", "T7"), true);
});

test("legacy tree routes and coach cards remain present while the index uses the simplified tree", () => {
  const index = readFileSync("public/athletes/arsenal/combat/z2h/wrestling/index.html", "utf8");
  assert.equal((index.match(/\/wrestling\/study\/skilltree\.html/g) || []).length, 8);
  for (let tier = 0; tier <= 7; tier += 1) {
    const legacy = readFileSync(`public/athletes/arsenal/combat/z2h/wrestling/study/skilltree-${tier}.html`, "utf8");
    assert.match(legacy, new RegExp(`pageTier = "T${tier}"`));
  }
  for (const entry of R2C_YOUTH_WRESTLING_PLACEMENTS) {
    assert.ok(readFileSync(entry.originalCardPath, "utf8").includes(`data-id="${entry.cardId}"`));
  }
});

test("Phase 2 browser files do not mutate progression, evidence, execution mode, or certification", () => {
  const sources = [
    "public/athletes/arsenal/combat/z2h/wrestling/study/skilltree.html",
    "public/athletes/arsenal/combat/z2h/wrestling/study/youth-wrestling-skill-tree.js",
    "public/athletes/arsenal/combat/z2h/wrestling/study/youth-wrestling-skill-tree-policy.js",
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(sources, /updateDoc|setDoc|runTransaction|promoteTier|issueCertificate|eligibleForAuto|executionMode\s*=/);
  assert.doesNotMatch(sources, /A\s+—|B\s+—|C\s+—/);
});
