const test = require("node:test");
const assert = require("node:assert/strict");
const {buildProtectedAutoLessonAssemblySource} = require("../lib/modules/autoLessonAssemblySource");

const evidence = {manifestId: "manifest-1", reviewRevision: 2, accepted: true};
const athlete = (athleteId, tier, track, overrides = {}) => ({
  athleteId, tier, journey: "Path2Legend", track, currentState: "LEARNED", evidence, ...overrides,
});
const group = (groupId, familyId, athletes) => ({
  groupId, familyId, purpose: "Highest verified group need", athletes,
});
const build = groups => buildProtectedAutoLessonAssemblySource({
  discipline: "wrestling", journey: "p2l", groups,
});

test("accepted server recommendation becomes a diagnostic assembly source", () => {
  const result = build([group("g1", "setups_ties", [athlete("F4_A", "T0", "INTRODUCE")])]);
  assert.equal(result.sourceEvidenceAccepted, true);
  assert.equal(result.recommendations[0].rankName, "Apprentice");
  assert.equal(result.recommendations[0].athletes[0].track, "INTRODUCE");
  assert.equal(result.authorizationStatus, "DIAGNOSTIC_ONLY");
  assert.equal(result.eligibleForAuto, false);
});

test("missing or rejected evidence blocks the source projection", () => {
  const result = build([group("g1", "setups_ties", [
    athlete("F4_A", "T0", "INTRODUCE", {evidence: {...evidence, accepted: false}}),
  ])]);
  assert.deepEqual(result.recommendations, []);
  assert.ok(result.blockers.includes("accepted-evidence-missing:g1"));
});

test("wrong Journey, rank, and server track are rejected", () => {
  const journey = build([group("journey", "setups_ties", [athlete("F4_A", "T0", "INTRODUCE", {journey: "Z2H"})])]);
  const rank = build([group("rank", "setups_ties", [athlete("F4_A", "T7", "INTRODUCE")])]);
  const track = build([group("track", "setups_ties", [athlete("F4_A", "T0", "CERTIFIED")])]);
  assert.ok(journey.blockers.includes("wrong-athlete-journey:journey"));
  assert.ok(rank.blockers.includes("unsupported-rank:rank:t7"));
  assert.ok(track.blockers.includes("invalid-server-track:track"));
});

test("wrong discipline is rejected", () => {
  const result = buildProtectedAutoLessonAssemblySource({
    discipline: "boxing", journey: "p2l",
    groups: [group("g1", "setups_ties", [athlete("F4_A", "T0", "INTRODUCE")])],
  });
  assert.ok(result.blockers.includes("unsupported-discipline"));
  assert.equal(result.eligibleForAuto, false);
});

test("mixed ranks within one training group are rejected", () => {
  const result = build([group("g1", "setups_ties", [
    athlete("F4_A", "T0", "INTRODUCE"), athlete("F4_B", "T1", "PRACTICE"),
  ])]);
  assert.ok(result.blockers.includes("inconsistent-group-rank:g1"));
});

test("source contract has no write or launch authority", () => {
  const result = build([group("g1", "setups_ties", [athlete("F4_A", "T0", "PRACTICE")])]);
  assert.equal(result.previewOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.coachApprovalRequired, true);
  assert.equal(result.eligibleForAuto, false);
  assert.equal("practiceId" in result, false);
  assert.equal("xpAwarded" in result, false);
});
