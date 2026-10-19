import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const builder = readFileSync(path.join(root, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
const start = builder.indexOf('buildBtn.addEventListener("click", async () => {');
const click = builder.slice(start);

test("existing HYBRID plans verify canonical practice with a bounded callable", () => {
  assert.ok(start >= 0);
  assert.match(click, /if \(reviewingExistingPlan\)\s*\{/);
  assert.match(click, /httpsCallable\(functions, "getPracticeSession", \{ timeout: 15000 \}\)/);
  assert.match(click, /practiceId: activePracticeId/);
  assert.match(click, /journey: String\(practice\.journey/);
  const existingBranch = click.slice(click.indexOf("if (reviewingExistingPlan)"), click.indexOf("} else {", click.indexOf("if (reviewingExistingPlan)")));
  assert.doesNotMatch(existingBranch, /openCanonicalPractice\(/);
});

test("handoff reports its stage and restores the correct action on failure", () => {
  assert.match(click, /Preparing lesson…/);
  assert.match(click, /Verifying existing practice…/);
  assert.match(click, /Opening Clipboard…/);
  assert.match(click, /console\.error\("Session entry failed", error\)/);
  assert.match(click, /canonicalPracticeRestored && Boolean\(activePracticeId\) && hybridReviewRequested \? "Accept Plan and Continue to Clipboard" : "Continue to Attendance"/);
  assert.match(click, /window\.location\.href = `\/coaches\/execution\/clipboard-2\.0\/\?session=/);
});
