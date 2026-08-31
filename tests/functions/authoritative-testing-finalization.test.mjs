import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BASE_CHECK_SCORE_KEYS,
  calculateAuthoritativePanelResult,
} from "../../functions/lib/modules/finalizeTestingSession.js";
import { assertFreezePeriodComplete } from "../../functions/lib/modules/retestAthlete.js";

const finalizerSource = readFileSync("functions/src/modules/finalizeTestingSession.ts", "utf8");
const resultsSource = readFileSync("public/coaches/testing/results-live.js", "utf8");
const passSource = readFileSync("functions/src/modules/passAthleteTest.ts", "utf8");
const freezeSource = readFileSync("functions/src/modules/freezeAthlete.ts", "utf8");

function scores(total) {
  const values = Object.fromEntries(BASE_CHECK_SCORE_KEYS.map((key) => [key, 5]));
  let remove = 100 - total;
  for (const key of BASE_CHECK_SCORE_KEYS) {
    if (remove <= 0) break;
    if (remove >= 5) {
      values[key] = 0;
      remove -= 5;
    } else if (remove === 2) {
      values[key] = 3;
      remove = 0;
    } else {
      throw new Error(`Unsupported fixture total: ${total}`);
    }
  }
  return values;
}

function panel(panel, coachId, total) {
  return { panel, coachId, testId: "test1", version: 1, status: "final",
    scores: scores(total), total };
}

test("two valid unique A/B panels finalize with a server-calculated average", () => {
  const out = calculateAuthoritativePanelResult([
    panel("A", "coach-a", 90), panel("B", "coach-b", 80),
  ]);
  assert.equal(out.average, 85);
  assert.equal(out.result, "PASS");
  assert.deepEqual(out.panels.map((entry) => entry.panel), ["A", "B"]);
});

test("three valid unique A/B/C panels also finalize", () => {
  const out = calculateAuthoritativePanelResult([
    panel("A", "coach-a", 90), panel("B", "coach-b", 85), panel("C", "coach-c", 80),
  ]);
  assert.equal(out.average, 85);
  assert.equal(out.result, "PASS");
  assert.deepEqual(out.panels.map((entry) => entry.panel), ["A", "B", "C"]);
});

test("duplicate panel slot is rejected", () => {
  assert.throws(() => calculateAuthoritativePanelResult([
    panel("A", "a", 90), panel("A", "b", 90), panel("C", "c", 90),
  ]), /DUPLICATE_PANEL_SLOT/);
});

test("duplicate coach is rejected", () => {
  assert.throws(() => calculateAuthoritativePanelResult([
    panel("A", "same", 90), panel("B", "same", 90), panel("C", "other", 90),
  ]), /DUPLICATE_PANEL_COACH/);
});

test("fewer than two or more than three panels are rejected", () => {
  assert.throws(() => calculateAuthoritativePanelResult([
    panel("A", "a", 90),
  ]), /TWO_TO_THREE_PANEL_SUBMISSIONS_REQUIRED/);

  assert.throws(() => calculateAuthoritativePanelResult([
    panel("A", "a", 90), panel("B", "b", 90), panel("C", "c", 90), panel("C", "d", 90),
  ]), /TWO_TO_THREE_PANEL_SUBMISSIONS_REQUIRED/);
});

test("A and B are required when only two coaches finalize", () => {
  assert.throws(() => calculateAuthoritativePanelResult([
    panel("A", "a", 90), panel("C", "c", 90),
  ]), /MISSING_REQUIRED_PANEL_SLOT/);
});

test("malformed observation score and forged total are rejected", () => {
  const malformed = panel("A", "a", 90);
  malformed.scores["0-0"] = 4;
  assert.throws(() => calculateAuthoritativePanelResult([
    malformed, panel("B", "b", 90), panel("C", "c", 90),
  ]), /MALFORMED_PANEL_SCORE_VALUE/);
  const forged = panel("A", "a", 90);
  forged.total = 100;
  assert.throws(() => calculateAuthoritativePanelResult([
    forged, panel("B", "b", 90), panel("C", "c", 90),
  ]), /PANEL_TOTAL_MISMATCH/);
});

test("non-final or non-Base-Check evidence is rejected", () => {
  const draft = panel("A", "a", 90);
  draft.status = "draft";
  assert.throws(() => calculateAuthoritativePanelResult([
    draft, panel("B", "b", 90), panel("C", "c", 90),
  ]), /MALFORMED_BASE_CHECK_SUBMISSION/);
});

test("85 or higher selects existing PASS policy and below 85 selects existing FREEZE policy", () => {
  assert.equal(calculateAuthoritativePanelResult([
    panel("A", "a", 85), panel("B", "b", 85),
  ]).result, "PASS");
  assert.equal(calculateAuthoritativePanelResult([
    panel("A", "a", 80), panel("B", "b", 85),
  ]).result, "FAIL");
  assert.match(finalizerSource, /passAthleteTestAuthoritatively\(uid, panelResult\.average\)/);
  assert.match(finalizerSource, /freezeAthleteAuthoritatively\(uid, panelResult\.average/);
});

test("client cannot supply or override the authoritative average", () => {
  assert.match(finalizerSource, /calculateAuthoritativePanelResult\(matching\)/);
  assert.doesNotMatch(finalizerSource, /input\?\.(average|score|total)/);
  assert.match(resultsSource, /Provisional average/);
  assert.doesNotMatch(resultsSource, /passAthleteTest|freezeAthlete|updateDoc/);
});

test("PASS remains separate from promotion", () => {
  assert.doesNotMatch(passSource, /promoteTier|progressionTier|curriculumTier/);
  assert.match(passSource, /"testing\.state": "COOLDOWN"/);
});

test("FAIL changes testing state only and preserves progression and curriculum tiers", () => {
  assert.match(freezeSource, /"testing\.state": "FREEZE"/);
  assert.doesNotMatch(freezeSource, /progressionTier|curriculumTier/);
});

test("retest rejects an active or invalid freeze and permits an expired freeze", () => {
  const now = Date.now();
  assert.throws(() => assertFreezePeriodComplete({ freezeUntil: new Date(now + 1_000) }, now),
    /FREEZE_PERIOD_NOT_COMPLETE/);
  assert.throws(() => assertFreezePeriodComplete({}, now), /FREEZE_UNTIL_REQUIRED/);
  assert.doesNotThrow(() => assertFreezePeriodComplete({ freezeUntil: new Date(now - 1) }, now));
});

test("session finalization and failed transition are idempotent", () => {
  assert.match(finalizerSource, /testingSessionFinalizations/);
  assert.match(finalizerSource, /if \(existing\.exists\).*idempotent: true/);
  assert.match(freezeSource, /testingActionReceipts/);
  assert.match(freezeSource, /if \(receiptSnap\.exists\)/);
});
