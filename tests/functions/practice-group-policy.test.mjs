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
const rosterAthlete = (athleteId, tier, journey = "Z2H", overrides = {}) => athlete(athleteId, tier, {
  journey,
  ageGroup: journey === "P2L" ? "Teen" : "Youth",
  ...overrides
});

function assertCompleteSuggestion(groups, roster) {
  assert.ok(groups.length > 0 && groups.length <= policy.MAX_TRAINING_GROUPS);
  const assigned = groups.flatMap((group) => group.athleteIds);
  assert.equal(assigned.length, roster.length);
  assert.equal(new Set(assigned).size, roster.length);
  assert.deepEqual([...assigned].sort(), roster.map(({ athleteId }) => athleteId).sort());
}

test("three historical fixtures receive deterministic tier-aware groups", () => {
  const roster = [
    rosterAthlete("staging-athlete-beginner", "T0"),
    rosterAthlete("staging-athlete-intermediate", "T2"),
    rosterAthlete("staging-athlete-advanced", "T4"),
  ];
  const groups = policy.suggestTierAwareTrainingGroups(roster);
  assertCompleteSuggestion(groups, roster);
  assert.deepEqual(groups.map((group) => group.progressionTier), ["T0", "T2", "T4"]);
});

test("ten mixed-Journey athletes preserve Journey boundaries and use at most three groups", () => {
  const roster = ["T0", "T0", "T1", "T2", "T3", "T4"].map((tier, index) => rosterAthlete(`r2c-${index}`, tier))
    .concat(["T0", "T1", "T2", "T4"].map((tier, index) => rosterAthlete(`p2l-${index}`, tier, "P2L")));
  const groups = policy.suggestTierAwareTrainingGroups(roster);
  assertCompleteSuggestion(groups, roster);
  assert.equal(groups.length, 3);
  assert.equal(groups.every((group) => new Set(group.roster.map(({ journey }) => journey)).size === 1), true);
  assert.equal(groups.some((group) => group.tierStatus === "mixed" && /Provisional fallback/.test(group.instructionalRecommendation)), true);
});

test("all 24 synthetic athletes are assigned exactly once with conservative reviewable focus", () => {
  const r2cTiers = ["T0", "T0", "T0", "T0", "T0", "T1", "T1", "T1", "T2", "T2", "T2", "T3", "T3", "T4", "T4"];
  const p2lTiers = ["T0", "T0", "T0", "T1", "T1", "T2", "T2", "T3", "T4"];
  const roster = r2cTiers.map((tier, index) => rosterAthlete(`r2c-${index}`, tier))
    .concat(p2lTiers.map((tier, index) => rosterAthlete(`p2l-${index}`, tier, "P2L")));
  const groups = policy.suggestTierAwareTrainingGroups(roster);
  assertCompleteSuggestion(groups, roster);
  assert.equal(groups.length, 3);
  for (const group of groups) {
    assert.equal(group.instructionalFocusConfirmed, false);
    assert.equal(group.tier, "");
    assert.equal(group.suggestedInstructionalTier, group.displayedTiers[0] || "");
    assert.equal(group.groupingBasis, "tier-display-fallback");
    assert.match(group.instructionalRecommendation, /Provisional/);
  }
});

test("missing tiers stay explicit and never inherit certified focus", () => {
  const roster = [rosterAthlete("known", "T2"), rosterAthlete("unknown", "")];
  const groups = policy.suggestTierAwareTrainingGroups(roster, { maxGroups: 1 });
  assertCompleteSuggestion(groups, roster);
  assert.equal(groups[0].tierStatus, "unavailable");
  assert.equal(groups[0].suggestedInstructionalTier, "T2");
  assert.equal(groups[0].instructionalFocusConfirmed, false);
  assert.equal(groups[0].tier, "");
});

test("more than three compatibility partitions never silently omit an athlete", () => {
  const roster = [
    rosterAthlete("one", "T0", "Z2H", { discipline: "wrestling" }),
    rosterAthlete("two", "T1", "Z2H", { discipline: "boxing" }),
    rosterAthlete("three", "T2", "P2L", { discipline: "wrestling" }),
    rosterAthlete("four", "T3", "P2L", { discipline: "boxing" }),
  ];
  const groups = policy.suggestTierAwareTrainingGroups(roster);
  assertCompleteSuggestion(groups, roster);
  assert.equal(groups.length, 3);
  assert.equal(groups.some(({ incompatibleOverflow }) => incompatibleOverflow), true);
  assert.equal(policy.validateTrainingGroupRoster(groups, roster.map(({ athleteId }) => athleteId)).ok, false);
});

test("Coach grouping and focus overrides restore by athlete identity rather than group position", () => {
  const roster = [rosterAthlete("one", "T0"), rosterAthlete("two", "T1"), rosterAthlete("three", "T4")];
  const suggestions = policy.suggestTierAwareTrainingGroups(roster, { maxGroups: 2 });
  let prior = policy.moveAthleteBetweenGroups(suggestions, "two", suggestions[1].id);
  prior = prior.map((group) => policy.normalizeTrainingGroup({
    ...group,
    instructionalTier: group.id === prior[1].id ? "T1" : "T0",
    instructionalFocusConfirmed: true,
    trainingSession: group.id === prior[1].id ? "7" : "3",
  }));
  const serializedPrior = JSON.parse(JSON.stringify(prior)).reverse();
  const restored = policy.restoreCoachGroupOverrides(suggestions, serializedPrior);
  assertCompleteSuggestion(restored, roster);
  assert.deepEqual(restored.map(({ athleteIds }) => athleteIds), serializedPrior.map(({ athleteIds }) => athleteIds));
  assert.deepEqual(restored.map(({ tier, trainingSession }) => ({ tier, trainingSession })), serializedPrior.map(({ tier, trainingSession }) => ({ tier, trainingSession })));
});

test("synthetic tier-display provenance survives grouping without becoming certified readiness", () => {
  const roster = [rosterAthlete("synthetic", "T2", "Z2H", {
    syntheticPlacement: true,
    syntheticPlacementCertified: false,
    syntheticPlacementSource: "mixed-journey-scenario-tier-v1",
  })];
  const [group] = policy.suggestTierAwareTrainingGroups(roster);
  assert.equal(group.roster[0].syntheticPlacement, true);
  assert.equal(group.roster[0].syntheticPlacementCertified, false);
  assert.equal(group.roster[0].syntheticPlacementSource, "mixed-journey-scenario-tier-v1");
  assert.equal(group.groupingBasis, "tier-display-fallback");
  assert.equal(group.instructionalFocusConfirmed, false);
});

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
  assert.equal(group.progressionTierLabel, "Tier Display Unavailable");
  assert.equal(group.hasUnknownTier, true);
  assert.equal(group.tier, "");
});

test("a homogeneous tier display remains provisional until Coach confirms instruction", () => {
  const group = policy.normalizeTrainingGroup({
    ...compatibleGroup({ id: "group-1" }),
    roster: [athlete("one", "T2"), athlete("two", "T2")]
  });
  assert.equal(group.tierStatus, "uniform");
  assert.equal(group.progressionTier, "T2");
  assert.equal(group.instructionalTier, "");
  assert.equal(group.instructionalFocusConfirmed, false);
});

test("legacy MANUAL athleteIds and athleteNames normalize without losing identity or selections", () => {
  const group = policy.normalizeTrainingGroup({
    ...compatibleGroup({ id: "group-1" }),
    athleteIds: ["one", "two"],
    athleteNames: ["Athlete One", "Athlete Two"],
    tier: "T2",
    instructionalTier: "T2",
    instructionalFocusConfirmed: true,
    trainingSession: "7"
  });
  assert.deepEqual(group.athleteIds, ["one", "two"]);
  assert.deepEqual(group.athleteNames, ["Athlete One", "Athlete Two"]);
  assert.deepEqual(group.roster.map(({ athleteId, athleteName }) => ({ athleteId, athleteName })), [
    { athleteId: "one", athleteName: "Athlete One" },
    { athleteId: "two", athleteName: "Athlete Two" }
  ]);
  assert.equal(group.tier, "T2");
  assert.equal(group.trainingSession, "7");
});

test("MANUAL Check-In group payload survives Session Builder and Clipboard contracts", () => {
  const manual = policy.normalizeTrainingGroup({
    ...compatibleGroup({ id: "group-1" }),
    athleteIds: ["one", "two"],
    athleteNames: ["Athlete One", "Athlete Two"],
    tier: "T1",
    instructionalTier: "T1",
    instructionalFocusConfirmed: true,
    trainingSession: "4",
    carryForwardNote: "Coach-selected review"
  });
  const stored = JSON.parse(JSON.stringify({ executionMode: "manual", trainingGroups: [manual] }));
  assert.deepEqual(stored.trainingGroups[0].athleteIds, ["one", "two"]);
  assert.deepEqual(stored.trainingGroups[0].athleteNames, ["Athlete One", "Athlete Two"]);
  assert.equal(stored.trainingGroups[0].tier, "T1");
  assert.equal(stored.trainingGroups[0].trainingSession, "4");
  assert.equal(stored.trainingGroups[0].carryForwardNote, "Coach-selected review");
});

test("mixed curriculum focus exists only after explicit Coach confirmation", () => {
  const roster = [athlete("one", "T1"), athlete("two", "T4")];
  assert.equal(policy.normalizeTrainingGroup(compatibleGroup({ roster, instructionalTier: "T2" })).tier, "");
  const confirmed = policy.normalizeTrainingGroup(compatibleGroup({ roster, instructionalTier: "T2", instructionalFocusConfirmed: true }));
  assert.equal(confirmed.tier, "T2");
  assert.equal(confirmed.progressionTierLabel, "Mixed Tiers");
});

test("Tier Waves allow same-Journey groups and require confirmed focus for mixed tiers", () => {
  const sameTier = policy.normalizeTrainingGroup(compatibleGroup({
    id: "group-1",
    roster: [athlete("one", "T2"), athlete("two", "T2")],
    instructionalTier: "T2", instructionalFocusConfirmed: true,
  }));
  assert.deepEqual(policy.tierWaveEligibility(sameTier), {
    eligible: true,
    reason: "same_tier_confirmed",
    journey: "z2h",
    tier: "T2",
    coachConfirmationRequired: true
  });

  const roster = [athlete("one", "T1"), athlete("two", "T4")];
  const unconfirmed = policy.normalizeTrainingGroup(compatibleGroup({ id: "group-1", roster }));
  assert.equal(policy.tierWaveEligibility(unconfirmed).reason, "focus_unconfirmed");
  const confirmed = policy.normalizeTrainingGroup(compatibleGroup({
    id: "group-1", roster, instructionalTier: "T2", instructionalFocusConfirmed: true
  }));
  assert.deepEqual(policy.tierWaveEligibility(confirmed), {
    eligible: true,
    reason: "mixed_tiers_confirmed",
    journey: "z2h",
    tier: "T2",
    coachConfirmationRequired: true
  });
  assert.deepEqual(confirmed.athleteTiers, { one: "T1", two: "T4" });
});

test("mixed or mismatched Journeys cannot share a Tier Wave", () => {
  const mixed = policy.normalizeTrainingGroup(compatibleGroup({
    id: "group-1",
    roster: [athlete("youth", "T2"), athlete("teen", "T2", { journey: "P2L" })],
    instructionalTier: "T2",
    instructionalFocusConfirmed: true
  }));
  assert.equal(policy.tierWaveEligibility(mixed).reason, "mixed_journeys");

  const mismatch = policy.normalizeTrainingGroup(compatibleGroup({
    id: "group-1", journey: "P2L", roster: [athlete("youth", "T2")]
  }));
  assert.equal(policy.tierWaveEligibility(mismatch).reason, "journey_mismatch");
});

test("Coach reassignment moves one athlete exactly once and recalculates group tiers", () => {
  const groups = [
    policy.normalizeTrainingGroup(compatibleGroup({ id: "group-1", roster: [athlete("one", "T1"), athlete("two", "T4")] })),
    policy.normalizeTrainingGroup(compatibleGroup({ id: "group-2", roster: [] }))
  ];
  const moved = policy.moveAthleteBetweenGroups(groups, "two", "group-2");
  assert.deepEqual(moved.map((group) => group.athleteIds), [["one"], ["two"]]);
  assert.deepEqual(moved.map((group) => group.progressionTier), ["T1", "T4"]);
  assert.equal(policy.validateTrainingGroupRoster(moved, ["one", "two"], { requireFocus: false }).ok, true);
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
  assert.match(attendance, /suggestTierAwareTrainingGroups\(roster/);
  assert.match(attendance, /currentPlanningMode\(\) === "hybrid"/);
  assert.match(attendance, /restoreCoachGroupOverrides\(suggested, prior\.trainingGroups\)/);
  assert.match(attendance, /const hybridPlanning = currentPlanningMode\(\) === "hybrid"/);
  assert.match(attendance, /: Boolean\(group\.instructionalTier \|\| group\.tier\)/);
  assert.match(attendance, /class="training-athlete-group"/);
  assert.match(attendance, /moveAthleteBetweenGroups\(captureTrainingGroups\(\)/);
  assert.match(attendance, /athleteCanJoinTrainingGroup\(athlete, candidate\)/);
  assert.match(attendance, /<select class="training-tier">/);
  assert.match(attendance, /instructionalFocusConfirmed/);
  assert.match(attendance, /validateTrainingGroupRoster\(trainingGroups/);
  assert.match(attendance, /localStorage\.setItem\("sandman_training_groups_v1"/);
  assert.match(builder, /attendanceContext\.trainingGroups/);
  assert.match(attendance, /syntheticPlacementCertified/);
  assert.match(clipboard, /trainingGroups: session\.trainingGroups/);
  assert.doesNotMatch(attendance, /systemSuggestions.*(?:available|enabled).*true/i);
  assert.doesNotMatch(policy.normalizeTrainingGroup.toString(), /\b(?:xp|promotion|testing|certif)/i);
});
