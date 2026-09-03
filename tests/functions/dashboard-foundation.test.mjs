import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { resolveAuthenticatedAthlete } from "../../public/assets/js/athlete-self-context.js";
import { classifyCoachAthleteScope, scopeCoachRoster } from "../../public/assets/js/coach-roster-scope.js";
import { combatDashboardModel, coachLaneRowModel, laneDashboardModel } from "../../public/assets/js/lane-dashboard-state.js";

const sessions = [1, 2, 3, 4].map((n) => ({ id: `STR-${String(n).padStart(3, "0")}`, n }));

test("Athlete resolution rejects an unrelated requested id and uses the sole auth-owned record", async () => {
  const records = {
    OTHER: { authUid: "someone-else" },
    MINE: { authUid: "auth-one", fullName: "Mine" },
  };
  const result = await resolveAuthenticatedAthlete({
    user: { uid: "auth-one" }, requestedId: "other", rememberedId: "",
    getAthleteById: async (id) => records[id] || null,
    findAthletesByAuthUid: async () => [{ athleteId: "MINE", athlete: records.MINE }],
  });
  assert.equal(result.athleteId, "MINE");
  assert.deepEqual(result.rejectedIds, ["OTHER"]);
});

test("Athlete resolution fails closed for multiple auth-owned records", async () => {
  const result = await resolveAuthenticatedAthlete({
    user: { uid: "auth-one" }, getAthleteById: async () => null,
    findAthletesByAuthUid: async () => [
      { athleteId: "A", athlete: { authUid: "auth-one" } },
      { athleteId: "B", athlete: { authUid: "auth-one" } },
    ],
  });
  assert.equal(result.athleteId, "");
  assert.equal(result.ambiguous, true);
});

test("Combat dashboard uses stored rank, XP, and cap without Profile or Coins", () => {
  assert.deepEqual(combatDashboardModel({ rankName: "Competitor", xp: 1240, xpCap: 2400 }), {
    rank: "Competitor", xp: 1240, cap: 2400,
  });
});

test("Shared lane dashboard exposes active, incomplete, pending, revision, waiting, and content missing", () => {
  const base = { lane: "strength", segmentId: "segment1", sessions, athlete: { xpStrength: 320 }, now: "2026-01-09T20:00:00Z" };
  assert.equal(laneDashboardModel({ ...base, submissions: {} }).status, "active");
  assert.equal(laneDashboardModel({ ...base, submissions: { "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "draft" } } }).status, "incomplete");
  assert.equal(laneDashboardModel({ ...base, submissions: { "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "pending" } } }).status, "pending");
  assert.equal(laneDashboardModel({ ...base, submissions: { "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "needs_revision" } } }).status, "revision");
  const completed = { "STR-001": { lane: "strength", segmentId: "segment1", sessionN: 1, status: "closed", closedAt: "2026-01-09T17:00:00Z" } };
  assert.equal(laneDashboardModel({ ...base, submissions: completed, now: "2026-01-09T18:00:00Z" }).status, "waiting");
  assert.equal(laneDashboardModel({ ...base, sessions: sessions.slice(0, 1), submissions: completed, now: "2026-01-20T18:00:00Z" }).status, "content-missing");
});

test("Strength and Honor card context and XP stay lane-specific", () => {
  const strength = laneDashboardModel({ lane: "strength", segmentId: "segment1", sessions, submissions: {}, athlete: { xpStrength: 320 }, phase: "inseason" });
  const honor = laneDashboardModel({ lane: "honor", segmentId: "segment2", sessions, submissions: {}, athlete: { xpHonor: 185 }, category: "teammates" });
  assert.equal(strength.phase, "inseason");
  assert.equal(strength.xp, 320);
  assert.equal(honor.category, "teammates");
  assert.equal(honor.xp, 185);
  assert.equal(coachLaneRowModel({ athleteId: "A", athlete: { fullName: "Jordan" }, strength, honor }).action, "none");
});

test("Coach scope supports location, multiple locations, assignment, Admin, and explicit legacy output", () => {
  const coach = { uid: "coach-1", scope: { locationIds: ["lompoc", "elk-grove"] } };
  assert.equal(classifyCoachAthleteScope(coach, { locationId: "elk-grove" }).included, true);
  assert.equal(classifyCoachAthleteScope(coach, { coachIds: ["coach-1"] }).reason, "coach-assignment");
  assert.equal(classifyCoachAthleteScope({ isSystemAdmin: true }, {}).reason, "admin");
  const scoped = scopeCoachRoster(coach, [
    { athleteId: "LOCAL", athlete: { locationId: "lompoc" } },
    { athleteId: "REMOTE", athlete: { locationId: "santa-ynez-valley" } },
    { athleteId: "LEGACY", athlete: {} },
  ]);
  assert.deepEqual(scoped.athletes.map((row) => row.athleteId), ["LOCAL"]);
  assert.deepEqual(scoped.unassigned.map((row) => row.athleteId), ["LEGACY"]);
});

test("Both Athlete hubs use the same authoritative resolver and lightweight model", () => {
  for (const file of ["public/athletes/hub/full-hub.html", "public/athletes/hub/mini-hub.html"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /resolveSignedInAthlete/);
    assert.match(source, /loadAthleteDashboard/);
    assert.match(source, /athleteStatusGrid/);
    assert.doesNotMatch(source, /Coins/);
  }
});
