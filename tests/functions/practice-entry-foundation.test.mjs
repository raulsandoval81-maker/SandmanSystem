import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("normal Session Builder practice remains compatible and gains canonical metadata", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  assert.match(source, /export const openPracticeSession/);
  assert.match(source, /entryMode:\s*"normal"/);
  assert.match(source, /liveSessions\/\$\{liveSessionId\}/);
  assert.match(source, /source:\s*"session-builder"/);
});

test("Coach-Directed and After-the-Fact use one narrow canonical practice operation", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  assert.match(source, /export const createOrRecoverCanonicalPractice/);
  assert.match(source, /"coach-directed",\s*"after-the-fact"/);
  assert.match(source, /requireActiveStaff[\s\S]*PRACTICE_STAFF_ROLES/);
  assert.match(source, /requirePracticeLocation\(actor, locationId\)/);
  assert.match(source, /requireCanonicalPracticeProgram/);
  assert.match(source, /practiceKey is required for after-the-fact entry/);
});

test("Coach scope is enforced while Admin retains system-wide access", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  assert.match(source, /const PRACTICE_STAFF_ROLES = COACH_STAFF_ROLES/);
  assert.match(source, /if \(\["admin", "system_admin"\]\.includes\(actor\.role\)\) return;/);
  assert.match(source, /staffLocationIds\(actor\.staff\)\.includes\(locationId\)/);
  assert.match(source, /Practice location is outside the staff member's authorized scope/);
});

test("canonical intended-session identity is deterministic and separates stable keys", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  assert.match(source, /canonical-practice-v1/);
  assert.match(source, /input\.sessionDateKey[\s\S]*input\.locationId[\s\S]*input\.discipline[\s\S]*input\.program[\s\S]*input\.practiceKey/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /input\.practiceKey/);
  assert.match(source, /if \(existing\.exists\)[\s\S]*idempotent = true;[\s\S]*return;/);
});

test("retrospective date and canonical program inputs fail closed", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  assert.match(source, /sessionDateKey must use YYYY-MM-DD/);
  assert.match(source, /sessionDateKey is not a valid calendar date/);
  assert.match(source, /sessionDateKey cannot be in the future/);
  assert.match(source, /program and discipline are not available at the selected location/);
});

test("entry operation creates no attendance, live execution, or XP side effect", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  const operation = source.slice(source.indexOf("export const createOrRecoverCanonicalPractice"), source.indexOf("export const getPracticeAttendanceReview"));
  assert.match(operation, /practiceSessions\/\$\{practiceId\}/);
  assert.doesNotMatch(operation, /attendance_sessions/);
  assert.doesNotMatch(operation, /liveSessions/);
  assert.doesNotMatch(operation, /authoritativeXp|awardXp|xpReceipts/);
});

test("new callable is exported", async () => {
  const source = await read("functions/src/index.ts");
  assert.match(source, /createOrRecoverCanonicalPractice/);
});
