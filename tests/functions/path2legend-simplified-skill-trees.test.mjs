import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BOXING_CARD_FAMILIES } from "../../public/coaches/cards/boxing/family-map.js";
import { canonicalPath2LegendRankName, getLadderForAthlete, LADDER_F4, LADDER_F8, LADDER_Q2M } from "../../public/assets/js/ladder.service.js";
import { familyProgressById, groupFiveTierPlacements, progressPresentation } from "../../public/assets/js/simplified-skill-tree-presentation.js";

const expectedCounts = { wrestling: [20, 20, 30, 30, 30], kickboxing: [20, 20, 25, 30, 30], boxing: [20, 25, 30, 30, 30] };

function cardProjection(discipline) {
  const rows = [];
  for (let tierIndex = 0; tierIndex <= 4; tierIndex += 1) {
    const directory = `public/coaches/cards/teen/p2l-${discipline}/t${tierIndex}`;
    const files = readdirSync(directory).filter((file) => /^skill-\d+-.*\.html$/.test(file)).sort();
    if (expectedCounts[discipline]) assert.equal(files.length, expectedCounts[discipline][tierIndex]);
    for (const file of files) {
      const source = readFileSync(path.join(directory, file), "utf8");
      rows.push({ cardId: source.match(/data-id="([^"]+)"/)?.[1], tier: `T${tierIndex}`, skillTitle: source.match(/<h2>Skill(?:\s+\d+)?\s+—\s+([^<]+)<\/h2>/)?.[1].replaceAll("&amp;", "&").trim(), originalCardPath: path.join(directory, file) });
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
    const browserProjection = manifest.placements.map(({ cardId, tier, skillTitle, originalCardPath }) => ({ cardId, tier, skillTitle, ...(discipline === "boxing" ? { originalCardPath } : {}) }));
    const sourceProjection = source.map(({ cardId, tier, skillTitle, originalCardPath }) => ({ cardId, tier, skillTitle, ...(discipline === "boxing" ? { originalCardPath } : {}) }));
    assert.deepEqual(browserProjection, sourceProjection);
    assert.deepEqual(groupFiveTierPlacements(manifest).map(({ skills }) => skills.length), expectedCounts[discipline]);
  });
}

test("all 390 Path2Legend Coach Card identities and teaching structures remain intact", () => {
  const cards = Object.keys(expectedCounts).flatMap((discipline) => cardProjection(discipline));
  assert.equal(cards.length, 390);
  assert.equal(new Set(cards.map(({ cardId }) => cardId)).size, 390);
  for (const card of cards) {
    const source = readFileSync(card.originalCardPath, "utf8");
    assert.ok(card.cardId);
    assert.ok(card.skillTitle);
    assert.match(source, /<p>A\s+—/);
    assert.match(source, /<p>B\s+—/);
    assert.match(source, /<p>C\s+—/);
  }
});

test("all active Path2Legend manifests and indexes display T2 Hero", () => {
  for (const discipline of Object.keys(expectedCounts)) {
    const manifest = JSON.parse(readFileSync(`public/assets/data/path2legend-${discipline}-skill-tree.json`, "utf8"));
    assert.equal(manifest.rankNames.T2, "Hero");
    assert.equal(manifest.placements.filter(({ tier }) => tier === "T2").every(({ rankName }) => rankName === "Hero"), true);
    assert.doesNotMatch(readFileSync(`public/coaches/cards/teen/p2l-${discipline}/index.html`, "utf8"), /<h2>Champion<\/h2>/);
    assert.doesNotMatch(readFileSync(`public/athletes/arsenal/combat/p2l/${discipline}/index.html`, "utf8"), />\s*Champion\s*</);
  }
});

test("legacy P2L Champion strings display as Hero without changing tier or Quest2Mastery", () => {
  const legacy = Object.freeze({ uid: "F4_100", programTrack: "Path2Legend", tier: "T2", rankName: "Champion", xpCap: 2200 });
  assert.equal(canonicalPath2LegendRankName(legacy, legacy.rankName), "Hero");
  assert.equal(legacy.rankName, "Champion");
  assert.equal(legacy.tier, "T2");
  assert.equal(legacy.xpCap, 2200);
  assert.equal(LADDER_F4[2].name, "Hero");
  assert.equal(getLadderForAthlete({ ...legacy, rankName: "Hero" }), LADDER_F4);
  assert.equal(getLadderForAthlete({ uid: "F8_100", tier: "T4", rankName: "Hero" }), LADDER_F8);
  assert.equal(canonicalPath2LegendRankName({ programTrack: "Quest2Mastery", tier: "T1" }, "Champion"), "Champion");
  assert.equal(LADDER_Q2M[2].name, "Champion");
});

test("family-level progress remains distinct from exact-card status", () => {
  const familyProgress = familyProgressById([{ familyId: "double_leg", state: "MASTERED" }]);
  const state = progressPresentation({ familyId: "double_leg" }, familyProgress);
  assert.equal(state.relatedState, "Related skill family: Mastered");
  assert.equal(state.exactState, "Exact skill status unknown");
  assert.doesNotMatch(state.exactState, /verified|mastered/i);
  assert.deepEqual(progressPresentation({ familyId: "" }, familyProgress), { exactState: "Not yet individually verified", relatedState: "" });
});

test("verified Path2Legend routes use the simplified tree and all legacy routes remain", () => {
  for (const discipline of ["wrestling", "kickboxing", "boxing"]) {
    const index = readFileSync(`public/athletes/arsenal/combat/p2l/${discipline}/index.html`, "utf8");
    assert.equal((index.match(/\/study\/skilltree\.html/g) || []).length, 5);
    for (let tier = 0; tier <= 4; tier += 1) assert.match(readFileSync(`public/athletes/arsenal/combat/p2l/${discipline}/study/skilltree-${tier}.html`, "utf8"), new RegExp(`T${tier}`));
  }
  assert.doesNotMatch(readFileSync("public/athletes/arsenal/combat/q2m/mma/index.html", "utf8"), /\/study\/skilltree\.html/);
});

test("Boxing uses all authoritative Coach Cards without importing divergent historical athlete titles", () => {
  assert.equal(cardProjection("boxing").length, 135);
  const manifest = JSON.parse(readFileSync("public/assets/data/path2legend-boxing-skill-tree.json", "utf8"));
  assert.equal(manifest.rankNames.T2, "Hero");
  assert.deepEqual(groupFiveTierPlacements(manifest).map(({ skills }) => skills.length), [20, 25, 30, 30, 30]);
  for (const entry of manifest.placements) {
    const cardSource = readFileSync(entry.originalCardPath, "utf8");
    const slug = path.basename(entry.originalCardPath).replace(/^skill-\d+-/, "").replace(/\.html$/, "");
    assert.equal(entry.familyId, BOXING_CARD_FAMILIES.p2l[entry.tier.toLowerCase()]?.[slug]);
    assert.match(cardSource, /<p>A\s+—/);
    assert.match(cardSource, /<p>B\s+—/);
    assert.match(cardSource, /<p>C\s+—/);
  }
  const repeated = manifest.placements.filter(({ skillTitle }) => ["Fight Awareness", "Pressure Layering"].includes(skillTitle));
  assert.equal(repeated.length, 4);
  assert.equal(new Set(repeated.map(({ cardId }) => cardId)).size, 4);

  const boxingAthleteCount = Array.from({ length: 5 }, (_, tier) =>
    (readFileSync(`public/athletes/arsenal/combat/p2l/boxing/study/skilltree-${tier}.html`, "utf8").match(/<h3>Skill\s+\d+\s+—/g) || []).length
  ).reduce((sum, count) => sum + count, 0);
  assert.equal(boxingAthleteCount, 125);
  assert.equal(manifest.placements.some(({ skillTitle }) => skillTitle === "Distance Traps"), false);
});

test("Quest2Mastery remains blocked on its documented source conflicts", () => {
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

test("Boxing presentation uses discipline-specific evidence and preserves wrong-branch protection", () => {
  const source = readFileSync("public/athletes/arsenal/combat/p2l/path2legend-simplified-skill-tree.js", "utf8");
  assert.match(source, /\["wrestling", "kickboxing", "boxing"\]/);
  assert.match(source, /athleteId\.startsWith\("F8_"\)/);
  assert.match(source, /disciplineProgress\(athlete\)/);
  assert.match(source, /athlete\.active === false/);
  assert.match(source, /record\?\.state === "suspended"/);
  assert.match(source, /discipline === "kickboxing" \? "muay-thai" : discipline/);
  assert.doesNotMatch(source, /updateDoc|setDoc|runTransaction/);
});
