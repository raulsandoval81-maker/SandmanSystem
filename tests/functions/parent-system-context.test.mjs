import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getParentAthleteDisciplineIds,
  normalizeParentDiscipline,
  resolveParentAthleteContext,
  resolveParentDisciplineXp
} from "../../public/assets/js/parent-athlete-context.js";
import {
  resolveAthleteDisciplineContext
} from "../../public/assets/js/discipline-policy.js";

const athlete = (overrides = {}) => ({
  id: "F8_0001",
  publicName: "Athlete One",
  disciplineIds: ["wrestling"],
  activeDiscipline: "wrestling",
  ...overrides
});

test("one athlete and one Wrestling discipline resolves without inventing another discipline", () => {
  const result = resolveParentAthleteContext(athlete());
  assert.deepEqual(result.disciplineIds, ["wrestling"]);
  assert.equal(result.activeDiscipline, "wrestling");
});

test("multiple assigned disciplines respect URL then remembered preference", () => {
  const record = athlete({ disciplineIds: ["wrestling", "boxing"] });
  assert.equal(resolveParentAthleteContext(record, {
    requestedDiscipline: "boxing",
    rememberedDiscipline: "wrestling"
  }).activeDiscipline, "boxing");
  assert.equal(resolveParentAthleteContext(record, {
    requestedDiscipline: "mma",
    rememberedDiscipline: "boxing"
  }).activeDiscipline, "boxing");
});

test("discipline candidates include nested and legacy athlete fields with normalized aliases", () => {
  const ids = getParentAthleteDisciplineIds(athlete({
    disciplineIds: ["wrestling"],
    disciplines: { boxing: {}, bjj: {} },
    primaryDiscipline: "muay_thai"
  }));
  assert.deepEqual(ids, ["wrestling", "boxing", "submission-grappling", "muay-thai"]);
  const bjj = { marker: "nested-bjj-record" };
  assert.equal(resolveParentAthleteContext({ id: "F4_0002", disciplines: { bjj } }).combat, bjj);
});

test("all legacy Kickboxing spellings canonicalize to Muay Thai", () => {
  for (const value of ["kickboxing", "kick-boxing", "kick_boxing"]) {
    assert.equal(normalizeParentDiscipline(value), "muay-thai");
  }
});

test("legacy and canonical Muay Thai assignments render one canonical choice", () => {
  const ids = getParentAthleteDisciplineIds(athlete({
    disciplineIds: ["muay-thai", "kick_boxing"],
    disciplines: { kickboxing: {}, "muay-thai": {} }
  }));
  assert.deepEqual([...ids].sort(), ["muay-thai", "wrestling"]);
  assert.equal(ids.filter((id) => id === "muay-thai").length, 1);
});

test("canonical Muay Thai selection resolves a legacy nested progression", () => {
  const muayThai = { xp: 35, tier: "T0" };
  const context = resolveParentAthleteContext(athlete({
    primaryDiscipline: "wrestling",
    disciplineIds: ["wrestling", "muay-thai"],
    disciplines: { kickboxing: muayThai },
    xp: 900
  }), { requestedDiscipline: "muay-thai" });
  assert.equal(context.combat, muayThai);
  assert.equal(context.usesTopLevelXp, false);
  assert.equal(resolveParentDisciplineXp({ xp: 900 }, context), 35);
});

test("secondary progression fails closed and primary progression retains root XP authority", () => {
  const record = athlete({
    primaryDiscipline: "wrestling",
    disciplineIds: ["wrestling", "muay-thai"],
    disciplines: { wrestling: { xp: 700 } },
    xp: 900
  });
  const secondary = resolveAthleteDisciplineContext(record, "muay-thai");
  assert.deepEqual(secondary.progression, {});
  assert.equal(secondary.usesTopLevelXp, false);
  assert.equal(resolveParentDisciplineXp(record, {
    ...secondary,
    combat: secondary.progression
  }), 0);
  const primary = resolveAthleteDisciplineContext(record, "wrestling");
  assert.equal(primary.progression.xp, 700);
  assert.equal(primary.usesTopLevelXp, true);
  assert.equal(resolveParentDisciplineXp(record, {
    ...primary,
    combat: primary.progression
  }), 900);
  assert.equal(record.xp, 900);
});

test("Parent and athlete hub runtime code contains no athlete-specific exception", () => {
  for (const path of [
    "public/assets/js/parent-athlete-context.js",
    "public/parent/my-athlete/my-athlete.js",
    "public/athletes/hub/mini-hub.html",
    "public/athletes/hub/full-hub.html"
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /F8_0001/);
  }
});

test("unknown or missing discipline never defaults Parent System to Wrestling", () => {
  const none = resolveParentAthleteContext({ id: "F4_0001" }, { requestedDiscipline: "mma" });
  assert.deepEqual(none.disciplineIds, []);
  assert.equal(none.activeDiscipline, "");
});

test("Parent System validates requested athlete against callable-authorized athletes", () => {
  const source = readFileSync("public/parent/system/system-context.js", "utf8");
  assert.match(source, /authorizedAthletes\.find\(\(athlete\) => athleteId\(athlete\) === requested\)/);
  assert.match(source, /authorizedAthletes\[0\]/);
  assert.doesNotMatch(source, /doc\(db,\s*["']athletes/);
});

test("selectors are conditional and navigation preserves authorized context", () => {
  const source = readFileSync("public/parent/system/system-context.js", "utf8");
  assert.match(source, /athleteField\.hidden = authorizedAthletes\.length <= 1/);
  assert.match(source, /disciplineField\.hidden = selectedContext\.disciplineIds\.length <= 1/);
  assert.match(source, /url\.searchParams\.set\("athlete", selectedContext\.athleteUid\)/);
  assert.match(source, /url\.searchParams\.set\("discipline", selectedContext\.activeDiscipline\)/);
});

test("Wrestling-only hub resources are fail-closed until Wrestling is authorized", () => {
  const html = readFileSync("public/parent/system/index.html", "utf8");
  for (const path of ["faq.html", "tournament-guide.html", "weight-hydration.html", "wrestling-101.html", "gear-hygiene.html"]) {
    assert.match(html, new RegExp(`data-parent-discipline="wrestling"[^>]+${path.replace(".", "\\.")}[^>]+hidden`));
  }
  assert.doesNotMatch(html, /handouts\/volunteer\.html/);
  const source = readFileSync("public/parent/system/system-context.js", "utf8");
  assert.match(source, /item\.hidden = item\.dataset\.parentDiscipline !== selectedContext\.activeDiscipline/);
});

test("direct child pages remain independent of Parent System selector state", () => {
  for (const path of ["public/parent/system/progression.html", "public/parent/system/fitness-self-defense/index.html"]) {
    assert.ok(readFileSync(path, "utf8").length > 0);
  }
});
