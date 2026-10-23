import assert from "node:assert/strict";
import test from "node:test";
import {
  athleteHomeLocationId,
  athleteScheduleDisciplineIds,
  canReadAthleteScheduleScope,
  canStaffManageCrossTraining,
  classifyPracticeAthleteEligibility,
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

test("practice eligibility distinguishes local enrollment from an approved visitor", () => {
  const local = classifyPracticeAthleteEligibility({
    athleteId: "F8_LOCAL",
    athlete: { locationId: "santa-ynez-valley", rosterStatus: "current" },
    hostLocationId: "santa-ynez-valley",
    disciplineId: "wrestling",
  });
  assert.equal(local.eligible, true);
  assert.equal(local.kind, "local");

  const visitor = classifyPracticeAthleteEligibility({
    athleteId: "F4_VISITOR",
    athlete: { locationId: "lompoc", rosterStatus: "current" },
    hostLocationId: "santa-ynez-valley",
    disciplineId: "wrestling",
    now: new Date("2026-09-20T12:00:00Z"),
    assignments: [{
      id: "F4_VISITOR_santa-ynez-valley_general",
      athleteId: "F4_VISITOR",
      homeLocationId: "lompoc",
      hostLocationId: "santa-ynez-valley",
      disciplineIds: ["wrestling"],
      status: "active",
      approvedBy: "management-lompoc",
      activeFrom: "2026-09-01T00:00:00Z",
      activeTo: "2026-09-30T23:59:59Z",
    }],
  });
  assert.equal(visitor.eligible, true);
  assert.equal(visitor.kind, "visitor");
  assert.equal(visitor.homeLocationId, "lompoc");
  assert.equal(visitor.assignmentId, "F4_VISITOR_santa-ynez-valley_general");
});

test("practice visitor eligibility fails closed for fabricated, mismatched, expired, or inactive authority", () => {
  const base = {
    athleteId: "F4_VISITOR",
    athlete: { locationId: "lompoc", rosterStatus: "current", visitorAuthorized: true },
    hostLocationId: "santa-ynez-valley",
    disciplineId: "wrestling",
    now: new Date("2026-09-20T12:00:00Z"),
  };
  assert.equal(classifyPracticeAthleteEligibility(base).reason, "ACTIVE_CROSS_TRAINING_ASSIGNMENT_REQUIRED");
  for (const assignment of [
    { athleteId: "F4_VISITOR", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley", disciplineIds: ["boxing"], status: "active", approvedBy: "management-lompoc" },
    { athleteId: "F4_VISITOR", homeLocationId: "lompoc", hostLocationId: "lompoc", disciplineIds: ["wrestling"], status: "active", approvedBy: "management-lompoc" },
    { athleteId: "F4_VISITOR", homeLocationId: "santa-ynez-valley", hostLocationId: "santa-ynez-valley", disciplineIds: ["wrestling"], status: "active", approvedBy: "management-lompoc" },
    { athleteId: "F4_VISITOR", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley", disciplineIds: ["wrestling"], status: "inactive", approvedBy: "management-lompoc" },
    { athleteId: "F4_VISITOR", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley", disciplineIds: ["wrestling"], status: "active", approvedBy: "management-lompoc", activeTo: "2026-09-19T23:59:59Z" },
    { athleteId: "F4_VISITOR", homeLocationId: "lompoc", hostLocationId: "santa-ynez-valley", disciplineIds: ["wrestling"], status: "active", approvedBy: "" },
  ]) {
    assert.equal(classifyPracticeAthleteEligibility({ ...base, assignments: [assignment] }).eligible, false);
  }
  assert.equal(classifyPracticeAthleteEligibility({
    ...base, athlete: { ...base.athlete, rosterStatus: "inactive" }, assignments: [],
  }).reason, "ATHLETE_NOT_CURRENT");
});
