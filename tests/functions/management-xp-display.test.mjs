import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync("public/management/xp-adjustments/xp-adjustments.js", "utf8");
const html = readFileSync("public/management/xp-adjustments/index.html", "utf8");

// Exercise the browser's real, self-contained progression helpers without
// Firebase, auth, a DOM, or any production calls.
const start = source.indexOf("function disciplineProgressions(member) {");
const end = source.indexOf("function renderProgressionSummary()", start);
assert.ok(start >= 0 && end > start, "XP progression helpers must remain testable");
const progressionFor = runInNewContext(
  source.slice(start, end) + "\nprogressionFor;",
  { clean: (value) => String(value ?? "").trim() }
);

const member = {
  athleteId: "F8_FIXTURE",
  primaryDiscipline: "wrestling",
  trackBase: "F8",
  tier: "T0",
  rankName: "Shadow",
  xp: 100,
  xpCap: 800,
  disciplineProgress: [
    { discipline: "wrestling", tier: "T0", rankName: "Shadow", xp: 0, xpCap: 0 },
    { discipline: "boxing", trackBase: "F4", tier: "T1", rankName: "Prospect",
      xp: 35, xpCap: 1600 },
    { discipline: "mma", trackBase: "ADULT", tier: "T2", rankName: "Competitor",
      xp: 15, xpCap: 2400 },
  ],
};

test("XP Management displays top-level authority for primary Wrestling only", () => {
  const wrestling = progressionFor(member, "wrestling");
  assert.equal(wrestling.xp, 100);
  assert.equal(wrestling.xpCap, 800);
  assert.equal(wrestling.tier, "T0");
  assert.equal(wrestling.rankName, "Shadow");
});

test("XP Management displays isolated secondary XP, ranks and caps", () => {
  const boxing = progressionFor(member, "boxing");
  const mma = progressionFor(member, "mma");
  assert.equal(boxing.xp, 35);
  assert.equal(boxing.xpCap, 1600);
  assert.equal(boxing.tier, "T1");
  assert.equal(boxing.rankName, "Prospect");
  assert.equal(boxing.trackBase, "F4");
  assert.equal(mma.xp, 15);
  assert.equal(mma.xpCap, 2400);
  assert.equal(mma.trackBase, "ADULT");
});

test("XP Management handles missing athlete and preserves a required reason note", () => {
  assert.equal(progressionFor(null, "wrestling"), null);
  assert.match(html, /Reason \/ Note \(Required\)/);
  assert.match(html, /<textarea\s+id="adjustmentReason"[\s\S]*?required\s*>/);
  assert.match(source, /if \(!reason\)\s*\{\s*setAdjustmentStatus/);
  assert.match(source, /reason,\s*category,/);
});
