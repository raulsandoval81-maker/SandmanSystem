import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const [html, js, css, attendance] = await Promise.all([
  readFile(new URL("public/coaches/execution/session-builder/index.html", root), "utf8"),
  readFile(new URL("public/coaches/execution/session-builder/session-builder.js", root), "utf8"),
  readFile(new URL("public/coaches/execution/session-builder/session-builder.css", root), "utf8"),
  readFile(new URL("public/coaches/attendance/session.js", root), "utf8"),
]);

test("HYBRID Review hides completed controls only after canonical restoration", () => {
  assert.match(html, /id="guidedSetupScreen"/);
  assert.match(html, /id="practiceContextIntro"/);
  assert.match(html, /id="practiceRoutingControls"/);
  assert.match(html, /id="hybridPlanningPanel"/);
  assert.match(html, /id="buildBtn"[^>]*>Continue to Attendance/);

  assert.match(js, /const enabled = Boolean\(active && canonicalPracticeRestored && selectedMode === "hybrid" && activePracticeId\)/);
  assert.match(js, /guidedSetupScreen\.hidden = enabled/);
  assert.match(js, /practiceContextIntro\.hidden = enabled/);
  assert.match(js, /practiceRoutingControls\.hidden = enabled/);
  assert.match(js, /sessionBuilderHeading\.textContent = enabled \? "HYBRID — Review Group Lessons"/);
  assert.doesNotMatch(js, /guidedSetupScreen\.remove\(|practiceContextIntro\.remove\(|practiceRoutingControls\.remove\(/);
  assert.match(css, /\.hybrid-review-state #practiceContextScreen/);
});

test("failed restoration never enables review presentation or plan acceptance", () => {
  const restoreStart = js.indexOf("async function restoreCanonicalPractice(practiceId)");
  const restoreEnd = js.indexOf("continueToContextBtn", restoreStart);
  const restore = js.slice(restoreStart, restoreEnd);
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart);
  assert.match(restore, /await requireCoach\(\)/);
  assert.match(restore, /status \|\| ""\)\.toLowerCase\(\) !== "active"/);
  assert.match(restore, /canonicalPracticeRestored = true;\s*await refreshHybridAvailability\(\);\s*setHybridReviewPresentation\(hybridReviewRequested\)/);

  const failureStart = js.indexOf("restoreCanonicalPractice(requestedPracticeId).catch");
  const failure = js.slice(failureStart);
  assert.match(failure, /canonicalPracticeRestored = false/);
  assert.match(failure, /practiceRestoreFailed = true/);
  assert.match(failure, /setHybridReviewPresentation\(false\)/);

  assert.match(js, /const reviewRestoreBlocked = hybridReviewRequested && !canonicalPracticeRestored/);
  assert.match(js, /if \(hybridReviewRequested && !canonicalPracticeRestored\)/);
  assert.match(js, /canonicalPracticeRestored && Boolean\(activePracticeId\)\s*&& hybridReviewRequested/);
});

test("checked-in groups and canonical practiceId remain on the existing HYBRID handoff", () => {
  assert.match(attendance, /practiceId=\$\{encodeURIComponent\(activePractice\.practiceId\)\}&planning=1/);
  assert.match(js, /String\(remembered\.practiceId \|\| ""\) === String\(activePracticeId \|\| ""\)/);
  assert.match(js, /Array\.isArray\(remembered\.trainingGroups\)/);
  assert.match(js, /getPractice\(\{ practiceId: activePracticeId \}\)/);
  assert.match(js, /practiceId: activePracticeId/);
  assert.match(js, /Accept Plan and Continue to Clipboard/);
  assert.match(js, /clipboard-2\.0\/\?session=\$\{encodeURIComponent\(payload\.sessionId\)\}&practiceId=\$\{encodeURIComponent\(payload\.practiceId\)\}/);
  assert.doesNotMatch(js.slice(js.indexOf("if (reviewingExistingPlan)"), js.indexOf("} else {", js.indexOf("if (reviewingExistingPlan)"))), /openCanonicalPractice\(/);
});

test("normal MANUAL, AUTO, historical, and new-practice routes retain their existing gates", () => {
  assert.match(js, /const enabled = Boolean\(active && canonicalPracticeRestored && selectedMode === "hybrid"/);
  assert.match(js, /const autoBlocked = selectedMode === "auto"/);
  assert.match(js, /AUTO Awaiting Certified Authorization/);
  assert.match(js, /const historical = String\(practiceEntryIntent\(\)\.mode \|\| ""\) === "after-the-fact"/);
  assert.match(js, /payload = await openCanonicalPractice\(payload\)/);
  assert.match(js, /setHybridReviewPresentation\(false\);/);
});
