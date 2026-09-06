import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  onboardingRelationshipFields,
} from "../../functions/lib/onboardingRelationship.js";

test("parent_guardian persists the authoritative family relationship value", () => {
  assert.deepEqual(
    onboardingRelationshipFields("parent_guardian"),
    { intakeAudience: "parent_guardian" }
  );
});

test("adult_athlete persists the authoritative independent relationship value", () => {
  assert.deepEqual(
    onboardingRelationshipFields("adult_athlete"),
    { intakeAudience: "adult_athlete" }
  );
});

test("missing or invalid source does not invent a relationship", () => {
  assert.deepEqual(onboardingRelationshipFields(null), {});
  assert.deepEqual(onboardingRelationshipFields(""), {});
  assert.deepEqual(onboardingRelationshipFields("parent-guardian"), {});
  assert.deepEqual(onboardingRelationshipFields("unknown"), {});
});

test("activation uses only the intake snapshot and adds no unrelated fields", () => {
  const source = readFileSync(
    "functions/src/approveAndActivate.ts",
    "utf8"
  );

  assert.match(
    source,
    /onboardingRelationshipFields\(\s*intakeData\.intakeAudience\s*\)/
  );
  assert.match(source, /\.\.\.onboardingRelationship/);
  assert.deepEqual(
    Object.keys(onboardingRelationshipFields("adult_athlete")),
    ["intakeAudience"]
  );
});
