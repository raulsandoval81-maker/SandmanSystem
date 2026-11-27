import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { athleteExperience, canonicalAthleteHref } from "../../public/assets/js/athlete-journey-routes.js";

const source = readFileSync("public/athletes/arsenal/mini-arsenal.app.js", "utf8");

test("Mini Arsenal reads Firestore document IDs without uppercasing or trusting poisoned storage", () => {
  const declaration = source.match(/const athleteId = String\([\s\S]*?\)\.trim\(\);/);
  assert.ok(declaration, "Mini Arsenal ID declaration not found");
  assert.doesNotMatch(declaration[0], /toUpperCase\(/);
  for (const id of ["staging-athlete-beginner", "F8_MixedCase", "F4_MixedCase"]) {
    const params = new URLSearchParams("?id=" + encodeURIComponent(id));
    const actual = runInNewContext(declaration[0] + "\nathleteId;", {
      params,
      localStorage: { getItem: () => "poisoned-foreign-id" },
      sessionStorage: { getItem: () => "poisoned-foreign-id" },
    });
    assert.equal(actual, id);
  }
});

test("Mini Arsenal safely honors canonical uid alias", () => {
  const declaration = source.match(/const athleteId = String\([\s\S]*?\)\.trim\(\);/);
  assert.ok(declaration);
  const actual = runInNewContext(declaration[0] + "\nathleteId;", {
    params: new URLSearchParams("?uid=staging-athlete-beginner"),
    localStorage: { getItem: () => "poisoned-foreign-id" },
    sessionStorage: { getItem: () => "poisoned-foreign-id" },
  });
  assert.equal(actual, "staging-athlete-beginner");
});

test("Arsenal journey follows the verified Athlete record rather than ID prefix", () => {
  const own = "staging-athlete-beginner";
  assert.equal(athleteExperience({ programTrack: "Z2H" }, own), "mini");
  assert.equal(athleteExperience({ programTrack: "R2C" }, own), "mini");
  assert.equal(athleteExperience({ programTrack: "P2L" }, own), "full");
  assert.equal(athleteExperience({}, "F8_MixedCase"), "mini");
  assert.equal(athleteExperience({}, own), "");
  assert.equal(canonicalAthleteHref("/athletes/arsenal/arsenal.html", own),
    "/athletes/arsenal/arsenal.html?id=staging-athlete-beginner");
});

test("Mini Arsenal requires scoped Firestore read before routing or showing a journey", () => {
  const read = source.indexOf("await getDoc(athleteRef)");
  const data = source.indexOf("athleteSnap.data() || {}");
  const decide = source.indexOf("const experience = athleteExperience(athlete, athleteId)");
  const full = source.indexOf('if (experience === "full")');
  const unknown = source.indexOf('if (experience !== "mini")');
  const display = source.indexOf("const requestedDiscipline =");
  assert.ok(source.includes("await ensureSignedIn()"));
  assert.ok(read >= 0 && data > read && decide > data && full > decide &&
    unknown > full && display > unknown);
  assert.match(source, /renderEmpty\("Unable to determine athlete journey\."\)/);
  assert.doesNotMatch(source, /if \(!athleteId\.startsWith\("F8_"\)\)/);
});
