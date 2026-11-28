import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync("scripts/staging/p0-authenticated-acceptance.mjs", "utf8");
const begin = source.indexOf("function fixtureStringList(");
const end = source.indexOf("async function readDocument(", begin);
assert.ok(begin > 0 && end > begin);
const { fixtureManagementCanReadAthlete } = runInNewContext(
  source.slice(begin, end) + "\n({ fixtureManagementCanReadAthlete })",
);
const str = value => ({ stringValue: value });
const list = (...values) => ({ arrayValue: { values: values.map(str) } });

test("Management may read an athlete at an explicitly authorized location", () => {
  assert.equal(fixtureManagementCanReadAthlete(
    { locationIds: list("santa-ynez-valley") },
    { locationId: str("santa-ynez-valley") },
  ), true);
});

test("Management may not read athletes outside authorized locations", () => {
  assert.equal(fixtureManagementCanReadAthlete(
    { locationIds: list("santa-ynez-valley") },
    { locationId: str("lompoc") },
  ), false);
});

test("Management with multiple authorized locations has bounded access", () => {
  const staff = { locationId: str("solvang"), locationIds: list("santa-ynez-valley", "lompoc") };
  assert.equal(fixtureManagementCanReadAthlete(staff, { locationId: str("lompoc") }), true);
  assert.equal(fixtureManagementCanReadAthlete(staff, { locationId: str("santa-maria") }), false);
});

test("Management with no location scope fails closed", () => {
  assert.equal(fixtureManagementCanReadAthlete({}, { locationId: str("santa-ynez-valley") }), false);
  assert.equal(fixtureManagementCanReadAthlete(
    { locationIds: list("santa-ynez-valley") }, {},
  ), false);
});

test("Management expected callable outcome comes from actual synthetic scope", () => {
  assert.match(source, /if \(role === "management"\) managementStaff = staff;/);
  assert.match(source, /const otherFields = await allowed\(other, tokens\.admin\);/);
  assert.match(source, /"management", tokens\.management, fixtures\.otherAthlete,[\s\S]*?"other", managementOtherAllowed/);
  assert.match(source, /for \(const role of \["athlete", "parent"\]\)/);
  assert.doesNotMatch(source, /for \(const role of \["athlete", "parent", "management"\]\)/);
});
