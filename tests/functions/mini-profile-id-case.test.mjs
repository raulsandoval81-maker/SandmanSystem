import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const mini = readFileSync("public/athletes/profile/mini-profile.js", "utf8");
const skills = readFileSync("public/athletes/profile/road2champion-skills.js", "utf8");

function paramsFor(id) {
  return new URLSearchParams("?id=" + encodeURIComponent(id));
}

test("Mini Profile preserves the exact Firestore ID instead of uppercasing it", () => {
  const declaration = mini.match(/const id = \(params\.get\("id"\)[^;]+;/);
  assert.ok(declaration, "Mini Profile ID extraction changed");
  for (const id of ["staging-athlete-beginner", "F8_MixedCase", "F4_MixedCase"]) {
    assert.equal(runInNewContext(declaration[0] + "\nid;", { params: paramsFor(id) }), id);
  }
  assert.match(mini, /getDoc\(doc\(db, "athletes", id\)\)/);
  assert.doesNotMatch(declaration[0], /toUpperCase\(/);
});

test("Mini Profile skills reader preserves the exact case-sensitive document ID", () => {
  const declaration = skills.match(/const athleteId\s*=\s*String\([\s\S]*?\)\.trim\(\);/);
  assert.ok(declaration, "Mini Profile skills identity extraction changed");
  for (const id of ["staging-athlete-beginner", "F8_MixedCase"]) {
    assert.equal(runInNewContext(declaration[0] + "\nathleteId;", { params: paramsFor(id) }), id);
  }
  assert.match(skills, /doc\(db, "athletes", athleteId\)/);
  assert.doesNotMatch(declaration[0], /toUpperCase\(/);
});

test("Mini Profile keeps Z2H on its verified Youth Mini route", () => {
  const declaration = mini.match(/const isRoad2Champion\s*=\s*[\s\S]*?id\.toUpperCase\(\)\.startsWith\("F8_"\);/);
  assert.ok(declaration, "Mini routing decision changed");
  const decide = (journey, id) =>
    runInNewContext(declaration[0] + "\nisRoad2Champion;", { journey, id });
  for (const journey of ["z2h", "zero2hero", "road2champion", "r2c"]) {
    assert.equal(decide(journey, "staging-athlete-beginner"), true, journey);
  }
  assert.equal(decide("", "f8_Legacy"), true);
  assert.equal(decide("p2l", "F4_Legacy"), false);
});

test("Profile and skills leave existing Firestore scope checks in place", () => {
  assert.match(mini, /await ensureSignedIn\(\)/);
  assert.match(skills, /await ensureSignedIn\(\)/);
});
