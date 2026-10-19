import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const attendance = readFileSync(path.join(repo, "public/coaches/attendance/session.js"), "utf8");
const builder = readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");

test("Practice Groups do not overwrite canonical practice Journey from the roster", () => {
  const begin = attendance.indexOf("function preparePracticeContext()");
  const end = attendance.indexOf("async function savePracticeContextToBuilderSession()", begin);
  assert.ok(begin >= 0 && end > begin);
  const section = attendance.slice(begin, end);
  assert.match(section, /suggestedTrainingGroups\(\)/);
  assert.doesNotMatch(section, /activePractice\s*=\s*\{/);
  assert.match(section, /renderTrainingGroups\(groups\)/);
});

test("Attendance does not reopen an active practice to sync group instructional choices", () => {
  const begin = attendance.indexOf("async function savePracticeContextToBuilderSession()");
  const end = attendance.indexOf("function todayLabel()", begin);
  assert.ok(begin >= 0 && end > begin);
  const section = attendance.slice(begin, end);
  assert.match(section, /validateTrainingGroupRoster/);
  assert.match(section, /trainingGroups/);
  assert.doesNotMatch(section, /httpsCallable\(functions,\s*["']openPracticeSession["']\)/);
});

test("Existing HYBRID plan uses canonical practice identity rather than reopening", () => {
  const begin = builder.indexOf('buildBtn.addEventListener("click"');
  assert.ok(begin >= 0);
  const section = builder.slice(begin);
  assert.match(section, /reviewingExistingPlan/);
  assert.match(section, /getPracticeSession/);
  assert.match(section, /practiceId:\s*activePracticeId/);
  assert.match(section, /journey:\s*String\(practice\.journey/);
  assert.match(section, /if \(reviewingExistingPlan\)\s*\{/);
  assert.match(section, /else\s*\{\s*const verifiedCoach = await requireCoach\(\)/);
  assert.match(section, /coachLabel\?\.dataset\.coachUid !== verifiedCoach\.uid/);
  assert.match(section, /payload = await openCanonicalPractice\(payload\)/);
  assert.match(section, /persistSession\(payload\)/);
});
