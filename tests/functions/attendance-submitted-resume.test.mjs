import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../../public/coaches/attendance/session.js", import.meta.url), "utf8");
const start = source.indexOf("async function submitForReview()");
const end = source.indexOf("\nfunction bindEvents()", start);
const submit = source.slice(start, end);
test("duplicate submit is avoided on canonical pending_review and finalized fails closed", () => {
  assert.ok(start >= 0 && end > start);
  assert.match(submit, /await authoritativeAttendanceStatus\(\)/);
  assert.match(submit, /status === "finalized"/);
  assert.match(submit, /status !== "pending_review"/);
  assert.match(submit, /latestStatus !== "pending_review"/);
  assert.match(submit, /if \(attendanceSubmissionPending\) \{[\s\S]*Attendance submission is already in progress\.[\s\S]*return;/);
});
test("existing builder flow routes directly to Clipboard with the same practice", () => {
  assert.match(submit, /\/coaches\/execution\/clipboard-2\.0\/\?session=/);
  assert.match(submit, /practiceId=\$\{encodeURIComponent\(activePractice\.practiceId\)\}/);
  assert.doesNotMatch(submit, /planning=1/);
  assert.match(submit, /setStatus\(error\?\.message/);
});
