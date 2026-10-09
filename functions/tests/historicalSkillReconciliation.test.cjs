const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileHistoryPages } = require("../lib/modules/historicalSkillReconciliation");

const athleteId = "F8_0001";
const discipline = "wrestling";
const observation = (state = "LEARNED") => ({
  familyId: "double_leg", state, coachUid: "coach-a",
  verifiedAt: "2026-10-01T18:00:00.000Z"
});
const practice = (id, date, state) => ({
  practiceId: id, sessionDateKey: date,
  verifiedSkills: [observation(state)]
});
const page = (scope, cursor, nextCursor, history, scopeExhausted = !nextCursor) => ({
  athleteId, discipline, scope, cursor, nextCursor,
  scopeExhausted, history
});
const assess = (pages, scopes = ["athlete-location"]) =>
  reconcileHistoryPages(pages, scopes, athleteId, discipline);

test("multi-page chain does not report a false cursor cycle", () => {
  const result = assess([
    page("athlete-location", null, "last-practice-1", [practice("p1", "2026-10-01", "LEARNED")], false),
    page("athlete-location", "last-practice-1", null, [practice("p2", "2026-10-02", "APPLIED")], true)
  ]);
  assert.equal(result.practices.length, 2);
  assert.equal(result.blockers.some(x => x.startsWith("cursor-cycle")), false);
  assert.deepEqual(result.skillTimelines[0].observations.map(x => x.state), ["LEARNED", "APPLIED"]);
  assert.equal(result.eligibleForAuto, false);
});

test("missing continuation page is a blocker", () => {
  const result = assess([page("athlete-location", null, "next", [practice("p1", "2026-10-01")], false)]);
  assert.ok(result.blockers.includes("missing-page:athlete-location"));
  assert.equal(result.coverageComplete, false);
});

test("scope overlap deduplicates identical practice", () => {
  const item = practice("p1", "2026-10-01");
  const result = assess([
    page("coach", null, null, [item]),
    page("athlete-location", null, null, [item]),
  ], ["coach", "athlete-location"]);
  assert.equal(result.practices.length, 1);
  assert.equal(result.blockers.includes("conflicting-duplicate-practice"), false);
});

test("conflicting duplicate practice blocks evidence readiness", () => {
  const result = assess([
    page("coach", null, null, [practice("p1", "2026-10-01", "LEARNED")]),
    page("athlete-location", null, null, [practice("p1", "2026-10-01", "MASTERED")]),
  ], ["coach", "athlete-location"]);
  assert.ok(result.blockers.includes("conflicting-duplicate-practice"));
  assert.equal(result.eligibleForAuto, false);
});

test("missing verification timestamp is not treated as complete evidence", () => {
  const item = practice("p1", "2026-10-01");
  item.verifiedSkills[0].verifiedAt = null;
  const result = assess([page("athlete-location", null, null, [item])]);
  assert.ok(result.blockers.includes("incomplete-verified-skill-observation"));
  assert.equal(result.coverageComplete, false);
});

test("invalid calendar dates are rejected", () => {
  const result = assess([page("athlete-location", null, null, [practice("p1", "2026-02-30")])]);
  assert.ok(result.blockers.includes("invalid-practice-date"));
  assert.equal(result.practices.length, 0);
});

test("even a complete visible chain never authorizes AUTO", () => {
  const result = assess([page("athlete-location", null, null, [practice("p1", "2026-10-01", "MASTERED")])]);
  assert.equal(result.coverageComplete, false);
  assert.equal(result.eligibleForAuto, false);
  assert.equal(result.skillTimelines[0].currentState, null);
});
