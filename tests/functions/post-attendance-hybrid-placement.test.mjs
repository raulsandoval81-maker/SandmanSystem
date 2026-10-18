import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = p => readFileSync(path.join(root, p), "utf8");
const attendanceHtml = file("public/coaches/attendance/session.html");
const attendanceJs = file("public/coaches/attendance/session.js");
const planning = file("public/coaches/attendance/hybrid-group-planning.js");
const builder = file("public/coaches/execution/session-builder/session-builder.js");

test("HYBRID selections appear after checked-in training groups, not on entry", () => {
  assert.ok(attendanceHtml.indexOf('id="postAttendanceHybridPlanning"') > attendanceHtml.indexOf('id="trainingGroups"'));
  assert.match(attendanceJs, /renderAttendanceHybridPlanning\(host, captureTrainingGroups\(\), hybridStageState/);
  assert.match(builder, /hybridPlanningPanel.hidden = !reviewingCheckedInPlan/);
  assert.match(builder, /get\("planning"\) === "1"/);
});

test("Group-specific choices persist to the matching practice's Session Builder record", () => {
  assert.match(attendanceJs, /planningSources: hybridStageState.planningSources/);
  assert.match(attendanceJs, /groupPlanning: Object.fromEntries\(trainingGroups.map/);
  assert.match(attendanceJs, /practiceId: activePractice\?\.practiceId/);
  assert.match(attendanceJs, /selectedWave: String\(prior.instructionalTier/);
  assert.match(planning, /resolveRoad2ChampionWrestlingTierWaves\(group.tier\)/);
  assert.match(planning, /familyId/);
});

test("System Suggestions remain unavailable and selections carry no mastery evidence", () => {
  assert.match(planning, /unavailable pending authoritative history/);
  assert.match(planning, /no verified progression or XP/);
  assert.doesNotMatch(planning, /promoteTier|updateDoc|setDoc|certify/);
});
