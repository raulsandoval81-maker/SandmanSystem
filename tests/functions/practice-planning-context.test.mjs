import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  planningContextPayload,
  planningContextRosterIds,
  restorePlanningContext,
} from "../../public/coaches/execution/session-builder/practice-planning-context.js";

const sixAthleteGroups = [
  {
    id: "group-1", label: "Group A", journey: "P2L", discipline: "wrestling",
    locationId: "santa-ynez-valley", practiceId: "practice-six", tier: "T0",
    instructionalTier: "T0", instructionalFocusConfirmed: true, trainingSession: "4",
    carryForwardNote: "Revisit stance motion",
    athleteIds: ["p-silva", "r-silva"], athleteNames: ["P. Silva", "R. Silva"],
  },
  {
    id: "group-2", label: "Group B", journey: "P2L", discipline: "wrestling",
    locationId: "santa-ynez-valley", practiceId: "practice-six", tier: "T1",
    instructionalTier: "T1", instructionalFocusConfirmed: true, trainingSession: "7",
    carryForwardNote: "Finish chain wrestling sequence",
    athleteIds: ["m-sandoval", "j-zaragoza", "c-kwasi"],
    athleteNames: ["M. Sandoval", "J. Zaragoza", "C. Kwasi"],
  },
  {
    id: "group-3", label: "Group C", journey: "Z2H", discipline: "wrestling",
    locationId: "santa-ynez-valley", practiceId: "practice-six", tier: "T0",
    instructionalTier: "T0", instructionalFocusConfirmed: true, trainingSession: "2",
    carryForwardNote: "Repeat safe finish",
    athleteIds: ["l-sampson"], athleteNames: ["L. Sampson"],
  },
];

test("six-athlete, three-group planning context restores every athlete exactly once", () => {
  const context = {
    version: 1,
    practiceId: "practice-six",
    revision: 8,
    trainingGroups: sixAthleteGroups,
    planningSources: { tierWaves: true, systemSuggestions: false, coachInput: true },
    planningSourcesExplicitlySelected: true,
    groupPlanning: {
      "group-1": { selectedWave: "wave_a", coachInput: { currentNote: "Short stance cues" } },
      "group-2": { selectedWave: "wave_b", coachInput: { currentNote: "Differentiate finishes" } },
      "group-3": { selectedWave: "wave_a", coachInput: { currentNote: "One-step instruction" } },
    },
    groupLessonAdjustments: { "group-1": "Shared stance", "group-2": "T1 finish", "group-3": "Youth finish" },
    clipboardPlan: { practiceId: "practice-six", schema: "standard-60", focus: "Finish safely", blocks: [] },
  };
  const restored = restorePlanningContext(
    { practiceId: "practice-six", executionMode: "hybrid" },
    { practiceId: "practice-six", planningContextDraft: context },
  );
  assert.deepEqual(planningContextRosterIds(restored).sort(), [
    "c-kwasi", "j-zaragoza", "l-sampson", "m-sandoval", "p-silva", "r-silva",
  ]);
  assert.equal(new Set(planningContextRosterIds(restored)).size, 6);
  assert.deepEqual(restored.trainingGroups.map((group) => group.athleteIds.length), [2, 3, 1]);
  assert.deepEqual(restored.trainingGroups.map((group) => group.tier), ["T0", "T1", "T0"]);
  assert.equal(restored.trainingGroups[1].trainingSession, "7");
  assert.equal(restored.trainingGroups[2].carryForwardNote, "Repeat safe finish");
  assert.equal(restored.groupPlanning["group-2"].coachInput.currentNote, "Differentiate finishes");
  assert.equal(restored.groupLessonAdjustments["group-3"], "Youth finish");
  assert.equal(restored.planningContextRevision, 8);
  assert.equal(restored.clipboardPlan.focus, "Finish safely");
});

test("planning context never restores into a different practice", () => {
  const local = { practiceId: "practice-two", trainingGroups: [{ id: "local-group" }] };
  const restored = restorePlanningContext(local, {
    practiceId: "practice-two",
    planningContextDraft: { practiceId: "practice-one", trainingGroups: sixAthleteGroups },
  });
  assert.deepEqual(restored, local);
});

test("planning payload preserves Coach-owned planning fields without AUTO authority", () => {
  const payload = planningContextPayload({
    trainingGroups: sixAthleteGroups,
    planningSources: { tierWaves: true, coachInput: true },
    planningSourcesExplicitlySelected: true,
    groupPlanning: { "group-1": { selectedWave: "wave_a" } },
    groupLessonAdjustments: { "group-1": "Coach adjustment" },
    clipboardPlan: { practiceId: "practice-six", blocks: [] },
  });
  assert.equal(payload.trainingGroups.length, 3);
  assert.equal(payload.groupPlanning["group-1"].selectedWave, "wave_a");
  assert.equal(payload.groupLessonAdjustments["group-1"], "Coach adjustment");
  assert.equal(payload.clipboardPlan.practiceId, "practice-six");
  assert.equal(Object.hasOwn(payload, "eligibleForAuto"), false);
  assert.equal(Object.hasOwn(payload, "autoApproved"), false);
});

test("server persistence is canonical-practice scoped and fail-closed for AUTO", async () => {
  const server = await readFile(new URL("../../functions/src/practice/practiceSessions.ts", import.meta.url), "utf8");
  assert.match(server, /export const savePracticePlanningContext/);
  assert.match(server, /attendance_sessions\/\$\{practiceId\}/);
  assert.match(server, /Practice Groups must contain every checked-in athlete exactly once/);
  assert.match(server, /Practice Group context does not match the canonical practice/);
  assert.match(server, /eligibleForAuto: false/);
  assert.match(server, /autoApproved: false/);
});

test("Attendance, Session Builder, and Clipboard all save or restore the canonical draft", async () => {
  const [attendance, builder, clipboard] = await Promise.all([
    readFile(new URL("../../public/coaches/attendance/session.js", import.meta.url), "utf8"),
    readFile(new URL("../../public/coaches/execution/session-builder/session-builder.js", import.meta.url), "utf8"),
    readFile(new URL("../../public/coaches/execution/clipboard-2.0/clipboard-2.0.js", import.meta.url), "utf8"),
  ]);
  assert.match(attendance, /httpsCallable\(functions, "savePracticePlanningContext"\)/);
  assert.match(attendance, /restorePlanningContext\(\{ practiceId \}, activePractice\)/);
  assert.match(builder, /restorePlanningContext\(readJson\(SESSION_KEY, \{\}\)/);
  assert.match(builder, /!canLaunchAuto\(payload\.trainingGroups, payload\.groupPrescriptions\)/);
  assert.match(clipboard, /restorePlanningContext\(/);
  assert.match(clipboard, /await saveCanonicalPlanningContext\(\)/);
});
