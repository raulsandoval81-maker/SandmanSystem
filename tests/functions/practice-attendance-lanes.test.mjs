import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("all attendance lanes retain practiceId as the attendance document identity", async () => {
  const server = await read("functions/src/practice/practiceSessions.ts");
  assert.match(server, /attendanceRef = db\.doc\(`attendance_sessions\/\$\{practiceId\}`\)/);
  assert.match(server, /practiceId, sessionId: practiceId/);
  assert.match(server, /attendanceSessionId: practiceId/);
});

test("Coach-Directed check-in uses server-authorized mutations without changing the Normal flow", async () => {
  const [server, checkIn] = await Promise.all([
    read("functions/src/practice/practiceSessions.ts"),
    read("public/coaches/attendance/session.js"),
  ]);
  assert.match(server, /export const updatePracticeCheckIn/);
  assert.match(server, /requireActiveStaff[\s\S]*PRACTICE_STAFF_ROLES/);
  assert.match(server, /requirePracticeLocation\(actor, locationId\)/);
  assert.match(checkIn, /httpsCallable\(functions, "updatePracticeCheckIn"\)/);
  assert.doesNotMatch(checkIn, /\bsetDoc\(|\bupdateDoc\(/);
});

test("After-the-Fact finalization uses canonical date and never fabricates check-in evidence", async () => {
  const server = await read("functions/src/practice/practiceSessions.ts");
  assert.match(server, /sessionDateKey = requireSessionDateKey\(practice\.sessionDateKey/);
  assert.match(server, /checkedIn = Array\.isArray\(existing\.checkedIn\) \? existing\.checkedIn : \[\]/);
  assert.match(server, /checkedInIds = Array\.isArray\(existing\.checkedInIds\) \? existing\.checkedInIds : \[\]/);
  assert.match(server, /After-the-fact attendance uses verified participants, not historical check-ins/);
});

test("review can add or remove roster athletes and presentIds is authoritative", async () => {
  const review = await read("public/coaches/attendance/attendance.js");
  assert.match(review, /reviewAthletes = Array\.isArray\(data\.roster\)/);
  assert.match(review, /selectedIds = new Set\(initialPresent/);
  assert.match(review, /presentIds = \[\.\.\.selectedIds\]/);
  assert.match(review, /finalizePracticeAttendance/);
});

test("finalization seeds athlete-session memory but leaves practice and live session open", async () => {
  const server = await read("functions/src/practice/practiceSessions.ts");
  const finalizer = server.slice(server.indexOf("export const finalizePracticeAttendance"), server.indexOf("export const getPracticeSession"));
  assert.match(finalizer, /practiceSessions\/\$\{practiceId\}\/athletes\/\$\{athleteId\}/);
  assert.match(finalizer, /athleteSessionRecord/);
  assert.doesNotMatch(finalizer, /status:\s*"closed"/);
  assert.doesNotMatch(finalizer, /closePracticeSession/);
  assert.doesNotMatch(finalizer, /liveSessions/);
});

test("identical retry is idempotent and unsafe post-XP correction fails closed", async () => {
  const server = await read("functions/src/practice/practiceSessions.ts");
  assert.match(server, /alreadyFinalized && sameIds\(existing\.presentIds, requestedPresentIds\)[\s\S]*String\(existing\.notes[\s\S]*idempotent = true/);
  assert.match(server, /xpLogs[\s\S]*meta\.attendanceSessionId[\s\S]*Attendance cannot be corrected after attendance-linked XP/);
});

test("attendance finalization has no XP or Daily Grind invocation side effects", async () => {
  const [server, review] = await Promise.all([
    read("functions/src/practice/practiceSessions.ts"),
    read("public/coaches/attendance/attendance.js"),
  ]);
  const finalizer = server.slice(server.indexOf("export const finalizePracticeAttendance"), server.indexOf("export const getPracticeSession"));
  assert.doesNotMatch(finalizer, /awardXpAuthoritatively|dispatchAuthoritativeXp|\/xp/);
  assert.doesNotMatch(review, /closePracticeSession/);
  assert.match(review, /Continue to Daily XP/);
});
