import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync("scripts/staging/p0-authenticated-acceptance.mjs", "utf8");
const begin = source.indexOf("function fixtureStringList(");
const end = source.indexOf("async function readDocument(", begin);
assert.ok(begin > 0 && end > begin);
const { fixtureCoachCanReadAthlete } = runInNewContext(
  source.slice(begin, end) + "\n({ fixtureCoachCanReadAthlete })",
);
const str = value => ({ stringValue: value });
const list = (...values) => ({ arrayValue: { values: values.map(str) } });
const coachUid = "staging-coach";
const staff = { locationIds: list("santa-ynez-valley") };

test("coach location grants access even without direct assignment", () => {
  assert.equal(fixtureCoachCanReadAthlete(coachUid, staff,
    { locationId: str("santa-ynez-valley"), coachIds: list("another-coach") }), true);
});
test("direct assignment grants access across location boundary", () => {
  assert.equal(fixtureCoachCanReadAthlete(coachUid, staff,
    { locationId: str("lompoc"), coachUid: str(coachUid) }), true);
});
test("unassigned, different-location athlete is denied", () => {
  assert.equal(fixtureCoachCanReadAthlete(coachUid, staff,
    { locationId: str("lompoc"), coachIds: list("another-coach") }), false);
});
test("missing location and assignment fail closed", () => {
  assert.equal(fixtureCoachCanReadAthlete(coachUid, staff, {}), false);
});
test("no broad Coach permit and explicit outsider callable denials on both targets", () => {
  assert.match(source, /"coach", tokens\.coach, fixtures\.otherAthlete,[\s\S]*?"other", coachOtherAllowed/);
  assert.match(source, /"out-of-scope-coach", session\.token,[\s\S]*?fixtures\.ownAthlete, "in-scope", false/);
  assert.match(source, /"out-of-scope-coach", session\.token,[\s\S]*?fixtures\.otherAthlete, "other", false/);
  assert.match(source, /await denied\(own, session\.token\);\s*await denied\(other, session\.token\);/);
});
