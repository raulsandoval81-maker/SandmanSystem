import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync("public/athletes/arsenal/arsenal.app.js", "utf8");
const idDeclaration = source.match(/  const athleteId = String\([\s\S]*?\)\.trim\(\);/);
assert.ok(idDeclaration, "Full Arsenal athlete ID declaration must remain inspectable");

function resolvedId({ search = "", stored = "", session = "" } = {}) {
  const params = new URLSearchParams(search);
  const localStorage = { getItem: key => key === "currentAthleteId" ? stored : null };
  const sessionStorage = { getItem: key => key === "currentAthleteId" ? session : null };
  return runInNewContext(idDeclaration[0] + "\nathleteId;", { params, localStorage, sessionStorage });
}

test("Full Arsenal keeps the exact verified Firestore document key from its URL", () => {
  for (const id of ["staging-athlete-beginner", "F4_MixedCase", "Athlete_01"]) {
    assert.equal(resolvedId({ search: "?id=" + encodeURIComponent(id), stored: "OLD_ALIAS" }), id);
    assert.equal(resolvedId({ search: "?athleteId=" + encodeURIComponent(id) }), id);
  }
});

test("Full Arsenal does not uppercase remembered case-sensitive IDs", () => {
  assert.equal(resolvedId({ stored: "staging-athlete-beginner" }), "staging-athlete-beginner");
  assert.equal(resolvedId({ session: "F4_MixedCase" }), "F4_MixedCase");
  assert.equal(resolvedId(), "");
});

test("Full Arsenal uses the case-preserved key for athlete lookup and output links", () => {
  assert.match(source, /doc\(db, "athletes", athleteId\)/);
  assert.match(source, /encodeURIComponent\(athleteId\)/);
  assert.match(source, /sandman_active_discipline_\$\{athleteId\}/);
  assert.doesNotMatch(idDeclaration[0], /toUpperCase\(/);
});

test("legacy F8 and F4 prefix classifications remain case-insensitive", () => {
  const match = source.match(/function getTrackCode\([\s\S]*?\n}\n\nfunction isRoad2Champion/);
  assert.ok(match);
  const getTrackCode = runInNewContext(match[0].replace(/\nfunction isRoad2Champion$/, "") + "\ngetTrackCode");
  assert.equal(getTrackCode("f8_MixedCase", {}, {}), "F8");
  assert.equal(getTrackCode("f4_MixedCase", {}, {}), "F4");
});
