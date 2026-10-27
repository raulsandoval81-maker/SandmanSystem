import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadRelease, validateRelease } from "../../scripts/staging/exact-sha-release-policy.mjs";

const finalReleaseId = "coach-companion-final-pr305-5ec93994";
const legacyReleaseId = "hybrid-handoff-pr133-8af57906";

function conditionSelectingCheck(workflow, check) {
  const lines = workflow.split("\n");
  const checkIndex = lines.findIndex((line) => line.includes(check));
  assert.notEqual(checkIndex, -1, `missing workflow check: ${check}`);
  return lines[checkIndex - 1];
}

test("final CP7 stages exactly six Hosting files and no Cloud Functions", async () => {
  const release = await loadRelease("coach-companion-final-pr305-5ec93994");
  assert.equal(release.applicationSha, "5ec939943456e6fad8e0c3e30de43de6c278211f");
  assert.equal(release.requiredAncestorSha, "11539235059ed69a226aa2b6b5a58fee9007d9b5");
  assert.equal(release.hostingBaselineSha, "3c0c583090cbb809b9626b3a11d2cf133445df6e");
  assert.equal(release.projectId, "sandman-combat-staging");
  assert.equal(release.hosting, true);
  assert.deepEqual(release.functions, []);
  assert.deepEqual(release.hostingFiles.sort(), [
    "public/coaches/execution/big-clock-2.0/big-clock-2.0.js",
    "public/coaches/execution/big-clock-2.0/index.html",
    "public/coaches/execution/coach-companion/coach-companion.css",
    "public/coaches/execution/coach-companion/coach-companion.js",
    "public/coaches/execution/coach-companion/index.html",
    "public/coaches/execution/engine/practice-remote-control.mjs"
  ].sort());
  assert.equal(release.recovery.functionsUnchanged, true);
  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  assert.match(workflow, /coach-companion-final-pr305-5ec93994/);
});

test("inherited CP7 engine requires the exact approved ancestry and is not a general bypass", async () => {
  const release = await loadRelease("coach-companion-final-pr305-5ec93994");
  const engine = "public/coaches/execution/engine/practice-remote-control.mjs";
  assert.deepEqual(release.inheritedHostingFiles, [engine]);
  assert.ok(release.hostingFiles.includes(engine));
  assert.ok(!release.allowedChangedFiles.includes(engine));
  const policySource = await readFile("scripts/staging/exact-sha-release-policy.mjs", "utf8");
  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  assert.match(policySource, /Unapproved inherited Hosting source/);
  assert.match(workflow, /git -C application-source diff --exit-code/);
  assert.match(workflow, /git -C application-source cat-file -e/);
});

test("final CP7 release selects Clipboard-first and four-group validation without changing legacy branches", async () => {
  const workflow = await readFile(".github/workflows/staging-exact-sha-release.yml", "utf8");
  const clipboardFirstCondition = conditionSelectingCheck(
    workflow,
    "grep -Fq '/coaches/execution/clipboard-2.0/?session='"
  );
  const fourGroupCondition = conditionSelectingCheck(
    workflow,
    "grep -q 'NORMAL_TRAINING_GROUP_CAPACITY = 3'"
  );

  assert.match(clipboardFirstCondition, new RegExp(finalReleaseId));
  assert.match(fourGroupCondition, new RegExp(finalReleaseId));
  assert.doesNotMatch(clipboardFirstCondition, new RegExp(legacyReleaseId));
  assert.doesNotMatch(fourGroupCondition, new RegExp(legacyReleaseId));
  assert.match(workflow, /else\n\s+grep -q 'executionMode === "hybrid"'[\s\S]*?grep -q 'planning=1'/);
  assert.match(workflow, /else\n\s+grep -q 'trainingGroups\.slice\(0, 3\)'/);
});
