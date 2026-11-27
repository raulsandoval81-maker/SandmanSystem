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
  assert.match(mini, /await readAuthorizedAthleteProfile\(id\)/);
  assert.doesNotMatch(declaration[0], /toUpperCase\(/);
});

test("Mini Profile skills reader preserves the exact case-sensitive document ID", () => {
  const declaration = skills.match(/const athleteId\s*=\s*String\([\s\S]*?\)\.trim\(\);/);
  assert.ok(declaration, "Mini Profile skills identity extraction changed");
  for (const id of ["staging-athlete-beginner", "F8_MixedCase"]) {
    assert.equal(runInNewContext(declaration[0] + "\nathleteId;", { params: paramsFor(id) }), id);
  }
  assert.match(skills, /await readAuthorizedAthleteProfile\(athleteId\)/);
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

test("direct Profile and Skills reads require a same-ID server grant before reading Firestore", async () => {
  for (const file of ["mini-profile.js", "profile.js", "adult-profile.js",
    "road2champion-skills.js", "path2legend-skills.js"]) {
    const source = readFileSync("public/athletes/profile/" + file, "utf8");
    assert.match(source, /await readAuthorizedAthleteProfile\(/);
    assert.doesNotMatch(source, /ensureSignedIn|getDoc\s*\(/);
  }
  const source = readFileSync("public/assets/js/athlete-profile-read.js", "utf8");
  const code = source.replace(/^import[^\n]+\n/, "").replace("export async function", "async function");
  for (const [response, expectedReads] of [[{}, 0], [{ authorized:true, athleteId:"foreign" }, 0],
    [{ authorized:true, athleteId:"F8_MixedCase" }, 1]]) {
    let reads = 0;
    await runInNewContext(code + '\nreadAuthorizedAthleteProfile("F8_MixedCase");', {
      auth: { authStateReady: async () => {}, currentUser: { uid:"own" } },
      db:{}, functions:{},
      httpsCallable: () => async data => {
        assert.equal(data.authorizeOnly, true);
        assert.equal(data.athleteId, "F8_MixedCase");
        return { data: response };
      },
      doc: (_db,_collection,id) => id,
      getDoc: async id => {
        reads++;
        assert.equal(id, "F8_MixedCase");
        return { exists: () => true, data: () => ({}), id };
      },
    });
    assert.equal(reads, expectedReads);
  }
});
