import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("public/coaches/attendance/session.js", "utf8");
const policy = readFileSync("public/coaches/attendance/practice-group-policy.js", "utf8");

test("practice group editor retains canonical athlete age band when label is shortened", () => {
  assert.match(source, /data-canonical-age-group=/);
  assert.match(source, /input\?\.dataset\.canonicalAgeGroup/);
  assert.match(source, /shown === displayTrainingAgeGroup\(canonical\) \? canonical : shown/);
  assert.match(source, /displayTrainingAgeGroup\(group\.ageGroup\)/);
});

test("practice group compatibility continues to require exact age group, journey, discipline, location and practice", () => {
  assert.match(policy, /normalizeCompatibilityValue\(value\.ageGroup\)/);
  assert.match(policy, /normalizeCompatibilityJourney\(value\.journey\)/);
  assert.match(policy, /normalizeCompatibilityDiscipline\(value\.discipline\)/);
  assert.match(policy, /normalizeCompatibilityValue\(value\.locationId\)/);
  assert.match(policy, /normalizeCompatibilityValue\(value\.practiceId\)/);
});
