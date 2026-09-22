import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const policy = await import(pathToFileURL(
  new URL("public/assets/js/discipline-policy.js", root).pathname
));

test("intake legacy Kickboxing values normalize to canonical Muay Thai", () => {
  for (const value of ["kickboxing", "kick-boxing", "kick_boxing", "muay-thai"]) {
    assert.equal(policy.normalizeDisciplineId(value), "muay-thai");
    assert.equal(policy.disciplineLabel(value), "Muay Thai");
  }
});

test("Road2Champion intake selectors expose one Muay Thai label", async () => {
  for (const file of [
    "public/intake-coach/index.html",
    "public/intake-coach/new-athlete.html"
  ]) {
    const source = await read(file);
    assert.match(source, /Road2Champion(?: ·)? Muay Thai/);
    assert.doesNotMatch(source, />\s*(?:Road2Champion(?: ·)? )?Kickboxing\s*</i);
  }
});

test("new intake placement writes canonical semantic discipline fields", async () => {
  const source = await read("public/intake-coach/new-athlete.js");
  assert.match(source, /program: "muay-thai"/);
  assert.match(source, /art: "muay-thai"/);
  assert.match(source, /discipline: "muay-thai"/);
  assert.match(source, /primaryDiscipline: "muay-thai"/);
});

test("legacy track, roster, and lane compatibility identifiers remain intact", async () => {
  const index = await read("public/intake-coach/index.html");
  const create = await read("public/intake-coach/new-athlete.js");
  const review = await read("public/intake-coach/review.js");
  assert.match(index, /data-lane="kickboxing"/);
  for (const source of [index, create, review]) assert.match(source, /zero2hero-kickboxing/);
  for (const source of [create, review]) assert.match(source, /youth-kickboxing/);
});

test("add-discipline token preserves structural lane but stores canonical semantics", async () => {
  const source = await read("public/intake-coach/coach.intake.js");
  assert.match(source, /forLane:[\s\S]*\? requestedLane/);
  assert.match(source, /requestedDiscipline:[\s\S]*\? requestedDiscipline/);
  assert.match(source, /requestedDiscipline\s*=\s*normalizeDisciplineId\(requestedLane\)/);
});

test("review canonicalizes legacy add-discipline requests", async () => {
  const source = await read("public/intake-coach/review.js");
  assert.match(source, /normalizeDisciplineId\([\s\S]*s\.requestedDiscipline[\s\S]*s\.forLane/);
  assert.match(source, /art: "muay-thai"/);
});

test("legacy and canonical Muay Thai assignments deduplicate in athlete review", async () => {
  const source = await read("public/intake-coach/new-athlete.js");
  assert.match(source, /\.map\(normalizeDisciplineId\)/);
  assert.match(source, /new Set\(/);
  assert.match(source, /findCanonicalDisciplineRecord/);
});

test("athlete onboarding displays legacy Kickboxing as Muay Thai", async () => {
  const source = await read("public/athlete-onboarding/onboarding.js");
  assert.match(source, /normalizeDisciplineId\(art\)/);
  assert.match(source, /case "muay-thai"/);
  assert.doesNotMatch(source, /return "Kickboxing"/);
});

test("intake Muay Thai paths contain no Wrestling fallback", async () => {
  for (const file of [
    "public/intake-coach/coach.intake.js",
    "public/intake-coach/new-athlete.js",
    "public/intake-coach/review.js",
    "public/athlete-onboarding/onboarding.js"
  ]) {
    const source = await read(file);
    assert.doesNotMatch(source, /kickbox[^\n]{0,80}wrestling|muay-thai[^\n]{0,80}\|\|\s*["']wrestling/i);
  }
});
