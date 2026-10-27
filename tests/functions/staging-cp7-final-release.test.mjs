import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadRelease, validateRelease } from "../../scripts/staging/exact-sha-release-policy.mjs";

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
