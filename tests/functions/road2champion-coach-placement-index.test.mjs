import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const counts = { T0: 14, T1: 14, T2: 23, T3: 26, T4: 30, CHAMPION_EXTENDED_DEVELOPMENT: 14 };
const disciplines = [
  { slug: "z2h-wrestling", manifest: "youth-wrestling-placement-manifest.json" },
  { slug: "z2h-boxing", manifest: "youth-boxing-placement-manifest.json" },
  { slug: "z2h-kickboxing", manifest: "youth-muay-thai-placement-manifest.json" },
];

test("Coach placement indexes use all manifest entries and original Coach Card URLs", () => {
  for (const discipline of disciplines) {
    const manifest = JSON.parse(readFileSync(`public/assets/data/${discipline.manifest}`, "utf8"));
    assert.deepEqual(manifest.approvedCounts, counts);
    assert.equal(manifest.placements.length, 121);
    assert.equal(new Set(manifest.placements.map(({ cardId }) => cardId)).size, 121);
    for (const entry of manifest.placements) {
      assert.ok(entry.originalCardPath);
      assert.ok(existsSync(entry.originalCardPath), entry.originalCardPath);
      assert.match(readFileSync(entry.originalCardPath, "utf8"), new RegExp(`data-id=["']${entry.cardId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`));
    }
    const page = readFileSync(`public/coaches/cards/youth/${discipline.slug}/index.html`, "utf8");
    assert.match(page, new RegExp(`/assets/data/${discipline.manifest}`));
    assert.match(page, new RegExp(`data-legacy-base="/coaches/cards/youth/${discipline.slug}"`));
    for (let tier = 0; tier <= 7; tier += 1) {
      assert.ok(existsSync(`public/coaches/cards/youth/${discipline.slug}/t${tier}/index.html`));
    }
  }
});

test("shared Coach renderer is manifest-driven, read-only, and links preserved card paths", () => {
  const renderer = readFileSync("public/coaches/cards/youth/road2champion-placement-index.js", "utf8");
  assert.match(renderer, /entry\.originalCardPath/);
  assert.match(renderer, /manifest\.approvedCounts/);
  assert.match(renderer, /CHAMPION_EXTENDED_DEVELOPMENT/);
  assert.doesNotMatch(renderer, /updateDoc|setDoc|runTransaction|promoteTier|issueCertificate|executionMode\s*=/);
});

test("Youth and Master indexes link every approved discipline placement page", () => {
  const indexes = [
    readFileSync("public/coaches/cards/youth/index.html", "utf8"),
    readFileSync("public/coaches/cards/master/index.html", "utf8"),
  ];
  for (const source of indexes) for (const discipline of disciplines) {
    assert.match(source, new RegExp(`/coaches/cards/youth/${discipline.slug}/`));
  }
  assert.doesNotMatch(indexes.join("\n"), /Youth — Zero 2 Hero Kickboxing[\s\S]{0,200}Coming Soon/);
});
