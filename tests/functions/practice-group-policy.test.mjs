import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const policy = await import(pathToFileURL(path.join(repo, "public/coaches/attendance/practice-group-policy.js")));

const athlete = (athleteId, tier) => ({ athleteId, athleteName: athleteId, tier });

test("three different official tiers remain individual and label the group Mixed Tiers", () => {
  const group = policy.normalizeTrainingGroup({
    id: "group-1",
    roster: [athlete("beginner", "T1"), athlete("intermediate", "T2"), athlete("advanced", "T4")]
  });
  assert.equal(group.progressionTierLabel, "Mixed Tiers");
  assert.equal(group.tierStatus, "mixed");
  assert.equal(group.tier, "");
  assert.deepEqual(group.athleteTiers, { beginner: "T1", intermediate: "T2", advanced: "T4" });
});

test("a missing tier fails closed and never inherits another athlete's tier", () => {
  const group = policy.normalizeTrainingGroup({
    id: "group-1",
    roster: [athlete("verified", "T3"), athlete("unknown", "")]
  });
  assert.equal(group.progressionTierLabel, "Tier Unverified");
  assert.equal(group.hasUnknownTier, true);
  assert.equal(group.tier, "");
});

test("a homogeneous verified group retains its common curriculum focus", () => {
  const group = policy.normalizeTrainingGroup({
    id: "group-1",
    roster: [athlete("one", "T2"), athlete("two", "T2")]
  });
  assert.equal(group.tierStatus, "verified");
  assert.equal(group.progressionTier, "T2");
  assert.equal(group.instructionalTier, "T2");
  assert.equal(group.instructionalFocusConfirmed, true);
});

test("mixed curriculum focus exists only after explicit Coach confirmation", () => {
  const roster = [athlete("one", "T1"), athlete("two", "T4")];
  assert.equal(policy.normalizeTrainingGroup({ roster, instructionalTier: "T2" }).tier, "");
  const confirmed = policy.normalizeTrainingGroup({ roster, instructionalTier: "T2", instructionalFocusConfirmed: true });
  assert.equal(confirmed.tier, "T2");
  assert.equal(confirmed.progressionTierLabel, "Mixed Tiers");
});

test("Coach reassignment moves one athlete exactly once and recalculates group tiers", () => {
  const groups = [
    policy.normalizeTrainingGroup({ id: "group-1", roster: [athlete("one", "T1"), athlete("two", "T4")] }),
    policy.normalizeTrainingGroup({ id: "group-2", roster: [] })
  ];
  const moved = policy.moveAthleteBetweenGroups(groups, "two", "group-2");
  assert.deepEqual(moved.map((group) => group.athleteIds), [["one"], ["two"]]);
  assert.deepEqual(moved.map((group) => group.progressionTier), ["T1", "T4"]);
  assert.equal(policy.validateTrainingGroupRoster(moved, ["one", "two"]).ok, true);
});

test("roster validation rejects duplicates, missing athletes, cross-practice IDs, unresolved focus, and more than three groups", () => {
  const confirmed = (id, roster) => policy.normalizeTrainingGroup({
    id, roster, instructionalTier: "T2", instructionalFocusConfirmed: true
  });
  const duplicate = [confirmed("group-1", [athlete("one", "T1")]), confirmed("group-2", [athlete("one", "T1")])];
  assert.deepEqual(policy.validateTrainingGroupRoster(duplicate, ["one"]).duplicateIds, ["one"]);
  assert.deepEqual(policy.validateTrainingGroupRoster([confirmed("group-1", [athlete("one", "T1")])], ["one", "two"]).missingIds, ["two"]);
  assert.deepEqual(policy.validateTrainingGroupRoster([confirmed("group-1", [athlete("one", "T1"), athlete("outside", "T1")])], ["one"]).unexpectedIds, ["outside"]);
  assert.deepEqual(policy.validateTrainingGroupRoster([policy.normalizeTrainingGroup({ id: "group-1", roster: [athlete("one", "")] })], ["one"]).unresolvedFocusGroupIds, ["group-1"]);
  assert.equal(policy.validateTrainingGroupRoster([
    confirmed("group-1", [athlete("one", "T1")]),
    confirmed("group-2", []), confirmed("group-3", []), confirmed("group-4", [])
  ], ["one"]).ok, false);
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
