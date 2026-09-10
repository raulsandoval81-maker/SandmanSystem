import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  isActiveCrossTrainingAssignment,
  mergeAthleteSchedules,
  normalizeCrossTrainingAssignment,
  scheduleScopesForAthlete,
} from "../../public/assets/js/athlete-schedule-scope.js";

const now = new Date("2026-09-08T12:00:00Z");
const assignment = (overrides = {}) => normalizeCrossTrainingAssignment("a1", {
  athleteId: "F4_0001", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley",
  disciplineIds: ["wrestling", "boxing"], status: "active",
  activeFrom: "2026-09-01T00:00:00Z", activeTo: "2026-10-01T00:00:00Z", ...overrides,
});

test("home-only athlete receives one home scope", () => {
  assert.deepEqual(scheduleScopesForAthlete({ athleteId: "F4_0001", homeLocationId: "lompoc", assignments: [], now }), [
    { locationId: "lompoc", kind: "home", disciplineIds: [] },
  ]);
});

test("active cross-training adds host while inactive, expired, and future assignments do not", () => {
  assert.equal(isActiveCrossTrainingAssignment(assignment(), now), true);
  for (const item of [
    assignment({ status: "inactive" }),
    assignment({ activeTo: "2026-09-07T00:00:00Z" }),
    assignment({ activeFrom: "2026-09-09T00:00:00Z" }),
  ]) assert.equal(isActiveCrossTrainingAssignment(item, now), false);
  assert.equal(scheduleScopesForAthlete({ athleteId: "F4_0001", homeLocationId: "lompoc", assignments: [assignment()], now }).length, 2);
});

test("multiple host assignments merge disciplines without duplicate location scopes", () => {
  const scopes = scheduleScopesForAthlete({
    athleteId: "F4_0001", homeLocationId: "lompoc", now,
    assignments: [assignment({ disciplineIds: ["wrestling"] }), assignment({ disciplineIds: ["boxing"] })],
  });
  assert.equal(scopes.length, 2);
  assert.deepEqual(scopes[1].disciplineIds.sort(), ["boxing", "wrestling"]);
});

test("merged schedules retain location identity and remove duplicate rows", () => {
  const schedule = { locationId: "santa-ynez-valley", locationName: "Santa Ynez Valley", status: "published", weekly: [{ day: "Monday", start: "18:00", title: "Wrestling" }], events: [], banner: {} };
  const merged = mergeAthleteSchedules([{ scope: { kind: "host" }, schedule }, { scope: { kind: "host" }, schedule }]);
  assert.equal(merged.weekly.length, 1);
  assert.equal(merged.weekly[0].scheduleLocationId, "santa-ynez-valley");
});

test("Parent and Athlete readers use the same authenticated scope and schedule adapter", () => {
  for (const path of ["public/parent/schedule/schedule.js", "public/communications/athlete/schedule-feed.js"]) {
    const source = fs.readFileSync(path, "utf8");
    assert.match(source, /getAthleteScheduleScope/);
    assert.match(source, /loadPublishedAthleteSchedule/);
    assert.doesNotMatch(source, /collection\(db,\s*["']athleteCrossTrainingAssignments/);
  }
  const parent = fs.readFileSync("public/parent/schedule/schedule.js", "utf8");
  assert.match(parent, /result\.data\.athletes/);
  assert.match(parent, /item\?\.id === requestedId/);
});
