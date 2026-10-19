import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const html = readFileSync(path.join(root, "public/coaches/execution/session-builder/index.html"), "utf8");
const js = readFileSync(path.join(root, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
const policy = readFileSync(path.join(root, "public/coaches/execution/session-builder/session-entry-policy.js"), "utf8");

test("practice setup and route have a single visible entry page and one active action", () => {
  assert.match(html, /id="guidedSetupScreen"/);
  assert.match(html, /id="practiceContextScreen"/);
  assert.doesNotMatch(html, /id="practiceContextScreen" hidden/);
  assert.doesNotMatch(html, /id="continueToContextBtn"/);
  assert.match(html, /id="disciplineFamilySelect"/);
  assert.match(html, /id="buildBtn"/);
  assert.match(js, /if \(practiceContextScreen\) practiceContextScreen.hidden = false/);
});
test("training rooms are selected from configured rooms and scoped to practice location", () => {
  assert.match(html, /<select id="roomSelect"/);
  assert.match(js, /SESSION_ROOMS.filter\(room => !entryLocationId \|\| room.locationId === entryLocationId\)/);
  assert.match(js, /roomByValue\(roomSelect\?\.value \|\| ""\)/);
  assert.match(policy, /export const SESSION_ROOMS/);
});
test("coach display does not forge an authorized coach identity or alter practice opening", () => {
  assert.match(js, /async function showVerifiedLeadCoach\(\)/);
  assert.match(js, /const coach = await requireCoach\(\)/);
  assert.match(js, /coachLabel\.dataset\.coachUid = coach\.uid/);
  assert.match(js, /const verifiedCoach = await requireCoach\(\)/);
  assert.match(js, /coachLabel\?\.dataset\.coachUid !== verifiedCoach\.uid/);
  assert.doesNotMatch(js, /practiceEntryIntent\(\)\.coachName/);
  assert.match(js, /openCanonicalPractice\(payload\)/);
  assert.match(js, /getPracticeSession/);
});
