import assert from "node:assert/strict";
import test from "node:test";
import {
  athleteHomeLocationId,
  athleteScheduleDisciplineIds,
  canReadAthleteScheduleScope,
  canStaffManageCrossTraining,
  crossTrainingAssignmentId,
} from "../../functions/lib/schedules/crossTrainingPolicy.js";

test("home-location Management can administer without cross-location scope", () => {
  const staff = { locationIds: ["lompoc"] };
  assert.equal(canStaffManageCrossTraining("management", staff, "lompoc", "santa-ynez-valley"), true);
  assert.equal(canStaffManageCrossTraining("management", staff, "santa-ynez-valley", "lompoc"), false);
});

test("host-location Coach can administer only its host", () => {
  const staff = { locationIds: ["santa-ynez-valley"] };
  assert.equal(canStaffManageCrossTraining("coach", staff, "lompoc", "santa-ynez-valley"), true);
  assert.equal(canStaffManageCrossTraining("coach", staff, "santa-ynez-valley", "lompoc"), false);
});

test("Admin has system-wide assignment authority", () => {
  assert.equal(canStaffManageCrossTraining("admin", {}, "lompoc", "santa-ynez-valley"), true);
});

test("home-location compatibility and deterministic assignment identity", () => {
  assert.equal(athleteHomeLocationId({ disciplines: { wrestling: { locationId: "lompoc" } }, primaryDiscipline: "wrestling" }), "lompoc");
  assert.equal(crossTrainingAssignmentId("F4_0001", "santa-ynez-valley"), "F4_0001_santa-ynez-valley_general");
});

test("schedule assignment scope is readable only by the athlete or an active linked Parent", () => {
  assert.equal(canReadAthleteScheduleScope("athlete-auth", "athlete-auth", []), true);
  assert.equal(canReadAthleteScheduleScope("parent-one", "athlete-auth", ["parent-one"]), true);
  assert.equal(canReadAthleteScheduleScope("other", "athlete-auth", ["parent-one"]), false);
  assert.equal(canReadAthleteScheduleScope("", "athlete-auth", ["parent-one"]), false);
});

test("athlete discipline authority preserves multi-discipline and striking aliases", () => {
  assert.deepEqual(athleteScheduleDisciplineIds({ disciplines: { wrestling: {}, boxing: {} } }).sort(), ["boxing", "wrestling"]);
  assert.deepEqual(athleteScheduleDisciplineIds({ disciplines: { kickboxing: {} } }).sort(), ["kickboxing", "muay-thai"]);
});
