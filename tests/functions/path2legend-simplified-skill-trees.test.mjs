import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { familyProgressById, groupFiveTierPlacements, progressPresentation } from "../../public/assets/js/simplified-skill-tree-presentation.js";

const expectedCounts = { wrestling: [20, 20, 30, 30, 30], kickboxing: [20, 20, 25, 30, 30] };

function cardProjection(discipline) {
  const rows = [];
  for (let tierIndex = 0; tierIndex <= 4; tierIndex += 1) {
    const directory = `public/coaches/cards/teen/p2l-${discipline}/t${tierIndex}`;
    const files = readdirSync(directory).filter((file) => /^skill-\d+-.*\.html$/.test(file)).sort();
    if (expectedCounts[discipline]) assert.equal(files.length, expectedCounts[discipline][tierIndex]);
    for (const file of files) {
      const source = readFileSync(path.join(directory, file), "utf8");
      rows.push({ cardId: source.match(/data-id="([^"]+)"/)?.[1], tier: `T${tierIndex}`, skillTitle: source.match(/<h2>Skill(?:\s+\d+)?\s+—\s+([^<]+)<\/h2>/)?.[1].replaceAll("&amp;", "&").trim() });
    }
  }
  return rows;
}

for (const discipline of Object.keys(expectedCounts)) {
  test(`${discipline} browser projection preserves every authoritative Coach Card ID and title`, () => {
    const manifest = JSON.parse(readFileSync(`public/assets/data/path2legend-${discipline}-skill-tree.json`, "utf8"));
    const source = cardProjection(discipline);
    assert.equal(manifest.placements.length, source.length);
    assert.equal(new Set(manifest.placements.map(({ cardId }) => cardId)).size, source.length);
    assert.deepEqual(manifest.placements.map(({ cardId, tier, skillTitle }) => ({ cardId, tier, skillTitle })), source);
    assert.deepEqual(groupFiveTierPlacements(manifest).map(({ skills }) => skills.length), expectedCounts[discipline]);
  });
}

test("family-level progress remains distinct from exact-card status", () => {
  const familyProgress = familyProgressById([{ familyId: "double_leg", state: "MASTERED" }]);
  const state = progressPresentation({ familyId: "double_leg" }, familyProgress);
  assert.equal(state.relatedState, "Related skill family: Mastered");
  assert.equal(state.exactState, "Exact skill status unknown");
  assert.doesNotMatch(state.exactState, /verified|mastered/i);
  assert.deepEqual(progressPresentation({ familyId: "" }, familyProgress), { exactState: "Not yet individually verified", relatedState: "" });
});

test("only verified Path2Legend routes use the simplified tree and all legacy routes remain", () => {
  for (const discipline of ["wrestling", "kickboxing"]) {
    const index = readFileSync(`public/athletes/arsenal/combat/p2l/${discipline}/index.html`, "utf8");
    assert.equal((index.match(/\/study\/skilltree\.html/g) || []).length, 5);
    for (let tier = 0; tier <= 4; tier += 1) assert.match(readFileSync(`public/athletes/arsenal/combat/p2l/${discipline}/study/skilltree-${tier}.html`, "utf8"), new RegExp(`T${tier}`));
  }
  assert.doesNotMatch(readFileSync("public/athletes/arsenal/combat/p2l/boxing/index.html", "utf8"), /\/study\/skilltree\.html/);
  assert.doesNotMatch(readFileSync("public/athletes/arsenal/combat/q2m/mma/index.html", "utf8"), /\/study\/skilltree\.html/);
});

test("Boxing and Quest2Mastery remain blocked on documented source conflicts", () => {
  assert.equal(cardProjection("boxing").length, 135);
  const boxingAthleteCount = Array.from({ length: 5 }, (_, tier) =>
    (readFileSync(`public/athletes/arsenal/combat/p2l/boxing/study/skilltree-${tier}.html`, "utf8").match(/<h3>Skill\s+\d+\s+—/g) || []).length
  ).reduce((sum, count) => sum + count, 0);
  assert.equal(boxingAthleteCount, 125);

  const serverRanks = readFileSync("functions/src/modules/promotion/rankMeta.ts", "utf8")
    .match(/const QUEST2MASTERY:[\s\S]*?\n};/)?.[0] || "";
  const browserRanks = readFileSync("public/assets/js/ladder.service.js", "utf8")
    .match(/export const LADDER_Q2M =[\s\S]*?\n];/)?.[0] || "";
  assert.doesNotMatch(serverRanks, /T4:/);
  assert.match(browserRanks, /R4/);

  const q2mIds = [];
  for (let tier = 0; tier <= 4; tier += 1) {
    const directory = `public/coaches/cards/adult/q2m-mma/t${tier}`;
    for (const file of readdirSync(directory).filter((name) => /^skill-\d+-.*\.html$/.test(name))) {
      q2mIds.push(readFileSync(path.join(directory, file), "utf8").match(/data-id="([^"]+)"/)?.[1]);
    }
  }
  assert.equal(q2mIds.length, 135);
  assert.equal(new Set(q2mIds).size, 129);
});

test("presentation code is read-only and does not alter execution or progression", () => {
  const sources = ["public/assets/js/simplified-skill-tree-presentation.js", "public/athletes/arsenal/combat/p2l/path2legend-simplified-skill-tree.js"].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(sources, /updateDoc|setDoc|runTransaction|promoteTier|issueCertificate|eligibleForAuto|executionMode\s*=/);
  assert.doesNotMatch(sources, /A\s+—|B\s+—|C\s+—/);
});
