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
  assert.match(submit, /if \(attendanceSubmissionPending\) return/);
});
test("existing builder flow still routes to hybrid planning with same practice", () => {
  assert.match(submit, /executionMode === "hybrid"/);
  assert.match(submit, /practiceId=\$\{encodeURIComponent\(activePractice\.practiceId\)\}&planning=1/);
  assert.match(submit, /setStatus\(error\?\.message/);
});
