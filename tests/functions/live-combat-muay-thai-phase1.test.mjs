import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const policy = await import(pathToFileURL(
  new URL("public/assets/js/discipline-policy.js", root).pathname
));

test("legacy Kickboxing spellings canonicalize to Muay Thai", () => {
  for (const value of ["kickboxing", "kick-boxing", "kick_boxing", "Muay Thai"]) {
    assert.equal(policy.normalizeDisciplineId(value), "muay-thai");
  }
});

test("combat router keeps canonical identity on legacy curriculum paths", async () => {
  const source = await read("public/assets/js/combat-router.js");
  assert.match(source, /discipline === "muay-thai"/);
  assert.match(source, /p2l\/kickboxing\/index\.html/);
  assert.match(source, /z2h\/kickboxing\/index\.html/);
  assert.match(source, /discipline=muay-thai/);
  assert.doesNotMatch(source, /discipline=kickboxing/);
});

test("teen and youth redirects route Muay Thai without Wrestling fallback", async () => {
  for (const [file, legacyPath] of [
    ["public/athletes/arsenal/combat/teen/index.html", "p2l/kickboxing"],
    ["public/athletes/arsenal/combat/youth/index.html", "z2h/kickboxing"]
  ]) {
    const source = await read(file);
    assert.match(source, /return "muay-thai"/);
    assert.match(source, new RegExp(`"muay-thai": "/athletes/arsenal/combat/${legacyPath}`));
    assert.doesNotMatch(source, /"kickboxing": "/);
  }
});

test("combat lock resolves canonical and legacy nested Muay Thai progression", async () => {
  const source = await read("public/assets/js/combat-lock.js");
  assert.match(source, /Object\.entries\(records\)/);
  assert.match(source, /normalizeDiscipline\(key\) === canonical/);
  assert.match(source, /explicitDiscipline\s*\? "T0"/);
});

test("combat app uses canonical route identity with legacy physical folders", async () => {
  const source = await read("public/athletes/arsenal/combat/combat.app.js");
  assert.match(source, /"muay-thai": \{/);
  assert.match(source, /z2h\/kickboxing\/index\.html/);
  assert.match(source, /p2l\/kickboxing\/index\.html/);
  assert.match(source, /normalizeDiscipline\(key\) === normalized/);
  assert.match(source, /normalized === primaryDiscipline[\s\S]*\? athlete[\s\S]*: \{\}/);
});

test("profile activity and skills expose canonical Muay Thai", async () => {
  const profile = await read("public/athletes/profile/profile-core.js");
  const p2l = await read("public/athletes/profile/path2legend-skills.js");
  const r2c = await read("public/athletes/profile/road2champion-skills.js");
  assert.match(profile, /canonicalDiscipline === "muay-thai"/);
  assert.doesNotMatch(profile, /return "Kickboxing"/);
  assert.match(p2l, /discipline: activeDiscipline/);
  assert.match(r2c, /discipline: canonicalDiscipline/);
});

test("certificate generator offers Muay Thai while accepting legacy aliases", async () => {
  const source = await read("public/coaches/ceremonies/certificates/generator.js");
  assert.match(source, /value: "muay-thai", label: "Muay Thai"/);
  assert.match(source, /"kickboxing"/);
  assert.doesNotMatch(source, /label: "Kickboxing"/);
});

test("live log offers one Muay Thai option and writes canonical identity", async () => {
  const source = await read("public/coaches/athletes/athlete-live-log.html");
  assert.equal((source.match(/<option value="muay-thai">Muay Thai<\/option>/g) || []).length, 1);
  assert.doesNotMatch(source, /<option value="kickboxing">/);
  assert.match(source, /e\.discipline = normalizeDiscipline/);
});

test("history filter matches legacy Kickboxing records as Muay Thai", async () => {
  const source = await read("public/coaches/athletes/athlete-log-history.html");
  assert.match(source, /normalizeDiscipline\(e\.discipline\)!==normalizeDiscipline\(d\)/);
  assert.match(source, /value="muay-thai">Muay Thai/);
  assert.doesNotMatch(source, /<option>kickboxing<\/option>/);
});

test("daily XP matches canonical and legacy Muay Thai roster values", async () => {
  const source = await read("public/coaches/daily-xp/daily-grind.js");
  assert.match(source, /includes\("kick"\)\s*\? "muay-thai"/);
  assert.match(source, /discipline === "muay-thai"/);
  assert.match(source, /wantedJourney === "z2h-kickboxing"/);
});

test("Fitness Kickboxing presentation remains outside this Combat patch", async () => {
  const source = await read("public/locations/lompoc/fitness.html");
  assert.match(source, /kickboxing/i);
});
