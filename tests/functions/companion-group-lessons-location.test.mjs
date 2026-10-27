import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Big Clock no longer renders coach-only group lesson overlay", async () => {
  const source = await readFile("public/coaches/execution/big-clock-2.0/big-clock-2.0.js", "utf8");
  assert.doesNotMatch(source, /renderGroupLessonReferences\(/);
  assert.doesNotMatch(source, /bigClockGroupLessons/);
  assert.match(source, /renderLaneIdentity\(\);/);
});

test("Companion carries approved group references and retains safe skill-card links", async () => {
  const source = await readFile("public/coaches/execution/coach-companion/coach-companion.js", "utf8");
  assert.match(source, /groupPrescriptions: Array\.isArray\(payload\.groupPrescriptions\)/);
  assert.match(source, /function renderGroupLessonReferences\(\)/);
  assert.match(source, /entry\?\.status !== "ready"/);
  assert.match(source, /href\.startsWith\("\/coaches\/cards\/"\)/);
  assert.match(source, /link\.rel = "noopener noreferrer"/);
  assert.match(source, /renderGroupLessonReferences\(\);/);
  assert.match(source, /renderRemoteControl\(practice\?\.sessionMemory\?\.executionControl/);
  assert.match(source, /if \(mode === "manual"/);
});

test("Companion reference is expandable and hidden when unmapped", async () => {
  const html = await readFile("public/coaches/execution/coach-companion/index.html", "utf8");
  const css = await readFile("public/coaches/execution/coach-companion/coach-companion.css", "utf8");
  assert.match(html, /<details id="companionGroupLessons"[^>]*hidden>/);
  assert.match(html, /id="companionGroupLessonsRows"/);
  assert.match(css, /#companionGroupLessons\[hidden\]\{display:none\}/);
});
