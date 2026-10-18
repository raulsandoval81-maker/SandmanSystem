import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const policy = await import(pathToFileURL(path.join(repo, "public/coaches/attendance/practice-group-policy.js")));

const compatible = {
  journey: "Z2H",
  discipline: "wrestling",
  ageGroup: "Youth 11–13",
  locationId: "academy-one",
  practiceId: "practice-one"
};
const athlete = (athleteId, tier, overrides = {}) => ({
  athleteId, athleteName: athleteId, tier, ...compatible, ...overrides
});
const compatibleGroup = (value = {}) => ({ ...compatible, ...value });

test("three different official tiers remain individual and label the group Mixed Tiers", () => {
  const group = policy.normalizeTrainingGroup({
    ...compatibleGroup({ id: "group-1" }),
    roster: [athlete("beginner", "T1"), athlete("intermediate", "T2"), athlete("advanced", "T4")]
  });
  assert.equal(group.progressionTierLabel, "Mixed Tiers");
  assert.equal(group.tierStatus, "mixed");
  assert.equal(group.tier, "");
  assert.deepEqual(group.athleteTiers, { beginner: "T1", intermediate: "T2", advanced: "T4" });
});

test("a missing tier fails closed and never inherits another athlete's tier", () => {
  const group = policy.normalizeTrainingGroup({
    ...compatibleGroup({ id: "group-1" }),
    roster: [athlete("verified", "T3"), athlete("unknown", "")]
  });
  assert.equal(group.progressionTierLabel, "Tier Unverified");
  assert.equal(group.hasUnknownTier, true);
  assert.equal(group.tier, "");
});

test("a homogeneous verified group retains its common curriculum focus", () => {
  const group = policy.normalizeTrainingGroup({
    ...compatibleGroup({ id: "group-1" }),
    roster: [athlete("one", "T2"), athlete("two", "T2")]
  });
  assert.equal(group.tierStatus, "verified");
  assert.equal(group.progressionTier, "T2");
  assert.equal(group.instructionalTier, "T2");
  assert.equal(group.instructionalFocusConfirmed, true);
});

test("mixed curriculum focus exists only after explicit Coach confirmation", () => {
  const roster = [athlete("one", "T1"), athlete("two", "T4")];
  assert.equal(policy.normalizeTrainingGroup(compatibleGroup({ roster, instructionalTier: "T2" })).tier, "");
  const confirmed = policy.normalizeTrainingGroup(compatibleGroup({ roster, instructionalTier: "T2", instructionalFocusConfirmed: true }));
  assert.equal(confirmed.tier, "T2");
  assert.equal(confirmed.progressionTierLabel, "Mixed Tiers");
});

test("Coach reassignment moves one athlete exactly once and recalculates group tiers", () => {
  const groups = [
    policy.normalizeTrainingGroup(compatibleGroup({ id: "group-1", roster: [athlete("one", "T1"), athlete("two", "T4")] })),
    policy.normalizeTrainingGroup(compatibleGroup({ id: "group-2", roster: [] }))
  ];
  const moved = policy.moveAthleteBetweenGroups(groups, "two", "group-2");
  assert.deepEqual(moved.map((group) => group.athleteIds), [["one"], ["two"]]);
  assert.deepEqual(moved.map((group) => group.progressionTier), ["T1", "T4"]);
  assert.equal(policy.validateTrainingGroupRoster(moved, ["one", "two"]).ok, true);
});

test("reassignment preserves Journey, discipline, age, location, and practice compatibility", () => {
  const source = policy.normalizeTrainingGroup(compatibleGroup({ id: "group-1", roster: [athlete("one", "T1")] }));
  for (const [field, value] of [
    ["journey", "P2L"],
    ["discipline", "boxing"],
    ["ageGroup", "Teen"],
    ["locationId", "academy-two"],
    ["practiceId", "practice-two"]
  ]) {
    const target = policy.normalizeTrainingGroup(compatibleGroup({ id: "group-2", [field]: value, roster: [] }));
    const moved = policy.moveAthleteBetweenGroups([source, target], "one", "group-2");
    assert.deepEqual(moved.map((item) => item.athleteIds), [["one"], []], field);
    assert.equal(policy.athleteCanJoinTrainingGroup(source.roster[0], target), false, field);
  }
});

test("tier differences do not block reassignment between otherwise compatible groups", () => {
  const groups = [
    policy.normalizeTrainingGroup(compatibleGroup({ id: "group-1", roster: [athlete("one", "T0")] })),
    policy.normalizeTrainingGroup(compatibleGroup({ id: "group-2", roster: [athlete("two", "T4")] }))
  ];
  const moved = policy.moveAthleteBetweenGroups(groups, "one", "group-2");
  assert.deepEqual(moved.map((item) => item.athleteIds), [[], ["two", "one"]]);
  assert.equal(moved[1].progressionTierLabel, "Mixed Tiers");
});

test("established Journey and Muay Thai aliases share compatibility without weakening other boundaries", () => {
  const athleteEntry = athlete("one", "T1", { journey: "Road2Champion", discipline: "kickboxing" });
  const target = compatibleGroup({ journey: "Z2H", discipline: "muay-thai" });
  assert.equal(policy.athleteCanJoinTrainingGroup(athleteEntry, target), true);
});

test("roster validation rejects duplicates, missing athletes, cross-practice IDs, unresolved focus, and more than three groups", () => {
  const confirmed = (id, roster) => policy.normalizeTrainingGroup({
    ...compatibleGroup({ id, roster, instructionalTier: "T2", instructionalFocusConfirmed: true })
  });
  const duplicate = [confirmed("group-1", [athlete("one", "T1")]), confirmed("group-2", [athlete("one", "T1")])];
  assert.deepEqual(policy.validateTrainingGroupRoster(duplicate, ["one"]).duplicateIds, ["one"]);
  assert.deepEqual(policy.validateTrainingGroupRoster([confirmed("group-1", [athlete("one", "T1")])], ["one", "two"]).missingIds, ["two"]);
  assert.deepEqual(policy.validateTrainingGroupRoster([confirmed("group-1", [athlete("one", "T1"), athlete("outside", "T1")])], ["one"]).unexpectedIds, ["outside"]);
  assert.deepEqual(policy.validateTrainingGroupRoster([policy.normalizeTrainingGroup(compatibleGroup({ id: "group-1", roster: [athlete("one", "")] }))], ["one"]).unresolvedFocusGroupIds, ["group-1"]);
  assert.equal(policy.validateTrainingGroupRoster([
    confirmed("group-1", [athlete("one", "T1")]),
    confirmed("group-2", []), confirmed("group-3", []), confirmed("group-4", [])
  ], ["one"]).ok, false);
});

test("roster validation reports incompatible assignments without changing progression", () => {
  const invalid = policy.normalizeTrainingGroup(compatibleGroup({
    id: "group-1",
    roster: [athlete("one", "T2", { locationId: "academy-two" })]
  }));
  const result = policy.validateTrainingGroupRoster([invalid], ["one"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.incompatibleAssignments, [{ athleteId: "one", groupId: "group-1" }]);
  assert.equal(invalid.roster[0].tier, "T2");
});

test("Attendance, Session Builder, Clipboard, memory, and progression boundaries remain connected", () => {
  const attendance = fs.readFileSync(path.join(repo, "public/coaches/attendance/session.js"), "utf8");
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  const clipboard = fs.readFileSync(path.join(repo, "public/coaches/execution/clipboard-2.0/clipboard-2.0.js"), "utf8");
  const server = fs.readFileSync(path.join(repo, "functions/src/practice/practiceSessions.ts"), "utf8");
  assert.match(attendance, /validateTrainingGroupRoster/);
  assert.match(attendance, /athleteLocationId === practiceLocationId/);
  assert.match(attendance, /planning=1/);
  assert.match(builder, /Mixed-tier curriculum requires Coach judgment/);
  assert.match(builder, /Confirm Group Instructional Focus/);
  assert.match(clipboard, /Coach-confirmed instructional focus/);
  assert.match(server, /sessionMemory\.planningContext/);
  assert.match(server, /evidenceEffect: "none"/);
  assert.doesNotMatch(policy.normalizeTrainingGroup.toString(), /\b(?:xp|promotion|testing|certif)/i);
});
