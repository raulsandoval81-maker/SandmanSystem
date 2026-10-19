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
test("Lead Coach display and practice opening use the verified staff identity", () => {
  const displayStart = js.indexOf("async function showVerifiedLeadCoach()");
  const displayEnd = js.indexOf("function showPrePracticeSetup()", displayStart);
  const buildStart = js.indexOf('buildBtn.addEventListener("click"');
  const buildSection = js.slice(buildStart);
  const existingStart = buildSection.indexOf("if (reviewingExistingPlan)");
  const newPracticeStart = buildSection.indexOf("} else {", existingStart);
  const existingPracticeSection = buildSection.slice(existingStart, newPracticeStart);
  const newPracticeSection = buildSection.slice(newPracticeStart, buildSection.indexOf("persistSession(payload)", newPracticeStart));

  assert.ok(displayStart >= 0 && displayEnd > displayStart);
  const displaySection = js.slice(displayStart, displayEnd);
  assert.match(displaySection, /const coach = await requireCoach\(\)/);
  assert.match(displaySection, /const staff = coach\.staff \|\| \{\}/);
  assert.match(displaySection, /Verified staff account/);
  assert.match(displaySection, /coachLabel\.dataset\.coachUid = coach\.uid/);
  assert.doesNotMatch(displaySection, /practiceEntryIntent\(\)\.coachName/);

  assert.match(newPracticeSection, /const verifiedCoach = await requireCoach\(\)/);
  assert.match(newPracticeSection, /coachLabel\?\.dataset\.coachUid !== verifiedCoach\.uid/);
  assert.match(newPracticeSection, /payload = await openCanonicalPractice\(payload\)/);

  assert.match(existingPracticeSection, /getPracticeSession/);
  assert.match(existingPracticeSection, /practiceId:\s*activePracticeId/);
  assert.doesNotMatch(existingPracticeSection, /openCanonicalPractice\(payload\)/);
});
