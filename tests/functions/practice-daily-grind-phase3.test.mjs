import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Daily Grind loads explicit canonical practice identity without consuming readiness", async () => {
  const source = await read("public/coaches/daily-xp/daily-grind.js");
  assert.match(source, /params\.get\("session"\).*params\.get\("practice"\).*params\.get\("practiceId"\)/s);
  assert.doesNotMatch(source, /readyForDailyGrind:\s*false[\s\S]*Daily Grind loaded/);
  assert.match(source, /completePracticeDailyGrind/);
  assert.match(source, /okCount === ids\.length/);
});

test("canonical attendance derives trusted practice context and guards Coach-Verified overlap", async () => {
  const source = await read("functions/src/services/authoritativeXpService.ts");
  assert.match(source, /practiceSessions\/\$\{canonicalPracticeId\}/);
  assert.match(source, /ATTENDANCE_PRACTICE_CONTEXT_MISMATCH/);
  assert.match(source, /practiceEvidenceKey/);
  assert.match(source, /attendance-coach-verified-overlap/);
  assert.match(source, /AMBIGUOUS_LEGACY_COACH_VERIFIED_PRACTICE_OVERLAP/);
});

test("readiness completion verifies durable attendance receipts and never closes practice", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  const operation = source.slice(source.indexOf("export const completePracticeDailyGrind"), source.indexOf("export const getPracticeSession"));
  assert.match(operation, /xpAwardReceipts\/\$\{awardReceiptKey\(athleteId, `attendance:\$\{practiceId\}`\)\}/);
  assert.match(operation, /Verified attendance XP receipts are required/);
  assert.match(operation, /readyForDailyGrind:\s*remainingIds\.length > 0/);
  assert.doesNotMatch(operation, /status:\s*"closed"|liveSessions|closePracticeSession/);
});

test("attendance receipt identity and XP policy formulas remain unchanged", async () => {
  const source = await read("functions/src/services/authoritativeXpService.ts");
  assert.match(source, /return `attendance:\$\{requiredString\(request\.meta\.attendanceSessionId/);
  assert.match(source, /const approved = base === "F8" \? \[\.\.\.F8_SOURCE_XP_VALUES\.combatPractice\] : \[5, 10, 15, 20\]/);
  assert.match(source, /MONTHLY_ATTENDANCE_CAP_REACHED/);
});
