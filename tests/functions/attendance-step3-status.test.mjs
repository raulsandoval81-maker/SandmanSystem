import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [html, js, css] = await Promise.all([
  readFile(new URL("public/coaches/attendance/session.html", root), "utf8"),
  readFile(new URL("public/coaches/attendance/session.js", root), "utf8"),
  readFile(new URL("public/coaches/attendance/attendance.css", root), "utf8"),
]);

const submitStart = js.indexOf("async function submitForReview()");
const submitEnd = js.indexOf("function bindEvents()", submitStart);
const submit = js.slice(submitStart, submitEnd);

test("Practice Groups exposes an accessible status beside Continue to Clipboard", () => {
  assert.match(html, /id="practiceContextStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="finishContextBtn"[^>]*aria-describedby="practiceContextStatus"[^>]*>Continue to Clipboard/);
  assert.match(css, /\.practice-context-status\.is-error/);
  assert.match(js, /if \(currentStep === 4\) \{\s*setPracticeContextStatus\(msg, isError\)/);
  assert.match(js, /el\.setAttribute\("aria-live", isError \? "assertive" : "polite"\)/);
});

test("missing instructional focus names and opens each affected Group editor", () => {
  assert.match(js, /function revealUnconfirmedFocusGroups\(groupIds = \[\]\)/);
  assert.match(js, /const label = `Group \$\{String\.fromCharCode\(65 \+ index\)\}`/);
  assert.match(js, /editor\.open = true/);
  assert.match(js, /focus\?\.setAttribute\("aria-invalid", "true"\)/);
  assert.match(js, /firstFocus\.focus\(\{ preventScroll: true \}\)/);
  assert.match(submit, /revealUnconfirmedFocusGroups\(rosterCheck\.unresolvedFocusGroupIds\)/);
  assert.match(submit, /confirm an instructional focus before continuing/);
  assert.doesNotMatch(submit, /finishContextBtn[^\n]*disabled/);
});

test("valid attendance submits once and keeps the canonical HYBRID Review route", () => {
  assert.ok(submitStart >= 0 && submitEnd > submitStart);
  assert.match(submit, /if \(attendanceSubmissionPending\)/);
  assert.match(submit, /attendanceSubmissionPending = true/);
  assert.equal((submit.match(/action: "submit"/g) || []).length, 1);
  assert.match(submit, /if \(status !== "pending_review"\)/);
  assert.match(submit, /if \(latestStatus !== "pending_review"\) throw error/);
  assert.match(submit, /practiceId=\$\{encodeURIComponent\(activePractice\.practiceId\)\}&planning=1/);
  assert.match(submit, /attendanceSubmissionPending = false/);
});

test("Step 3 validation does not mutate canonical practice or progression policy", () => {
  assert.doesNotMatch(submit, /openPracticeSession|promoteTier|issueCertificate|awardXp|updateDoc|setDoc/);
  assert.match(submit, /savePracticeContextToBuilderSession\(\)/);
  assert.match(submit, /activePractice\.practiceId/);
});
