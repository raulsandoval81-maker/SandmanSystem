import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  awardReceiptKey,
  buildAwardPlan,
  conflictingArenaBonusKind,
  deriveTrustedStrengthAmount,
  deriveYouthAssignmentAward,
  isPracticeDayAllowed,
  normalizeXpRequest,
  remainingChampionshipDelta,
  requestAwardIdentity,
  shouldEmitAwardSideEffects,
} from "../../functions/lib/services/authoritativeXpService.js";

const youthAssignment = (overrides = {}) => ({
  assignmentId: "youth-assignment-1",
  status: "completed",
  lane: "conditioning",
  track: "f8",
  primaryLane: "strength",
  strengthMinutes: 18,
  honorMinutes: 12,
  totalMinutes: 30,
  rewardXp: 5,
  ...overrides,
});

const f8 = (overrides = {}) => {
  const tier = overrides.progressionTier ?? overrides.tier ?? "T1";
  return { uid: "F8_2000", trackBase: "F8", tier, progressionTier: tier,
    xp: 100, xpCap: 1600, ...overrides };
};
const f4 = (overrides = {}) => ({
  uid: "F4_2000", trackBase: "F4", tier: "T1", xp: 100, xpCap: 1600,
  ...overrides,
});
const request = (kind, amount, meta = {}) => normalizeXpRequest({
  uid: "F8_2000", kind, amount, meta,
});
const plan = (athlete, req, extra = {}, monthly = {}) => buildAwardPlan({
  athlete, athleteId: athlete.uid, request: req, monthly, ...extra,
});

test("exact duplicate practice requests resolve to the same stable receipt", () => {
  const a = request("ATTENDANCE", 10, {
    attendanceSessionId: "attendance-1", sessionId: "mat-1",
  });
  const b = request("ATTENDANCE", 10, {
    attendanceSessionId: "attendance-1", sessionId: "mat-1",
  });
  assert.equal(requestAwardIdentity(a), "attendance:attendance-1");
  assert.equal(awardReceiptKey(a.uid, requestAwardIdentity(a)),
    awardReceiptKey(b.uid, requestAwardIdentity(b)));
});

test("practice without its required attendance identity fails clearly", () => {
  assert.throws(() => requestAwardIdentity(request("ATTENDANCE", 10)),
    /meta\.attendanceSessionId required/);
});

test("practice permits Monday through Saturday and excludes Sunday", () => {
  for (const dayKey of [
    "2026-08-31", "2026-09-01", "2026-09-02",
    "2026-09-03", "2026-09-04", "2026-09-05",
  ]) assert.equal(isPracticeDayAllowed(dayKey), true);
  assert.equal(isPracticeDayAllowed("2026-09-06"), false);
});

test("two separately identified F8 practices in one discipline/day can reach 20", () => {
  const req = request("ATTENDANCE", 10, {
    attendanceSessionId: "attendance-2", sessionId: "mat-1", discipline: "wrestling",
  });
  const out = plan(f8(), req, { practiceState: { count: 1, xp: 10 } });
  assert.deepEqual(out.practiceStateAfter, { count: 2, xp: 20 });
});

test("a third F8 practice in one discipline/day is rejected", () => {
  const req = request("ATTENDANCE", 5, {
    attendanceSessionId: "attendance-3", sessionId: "mat-1", discipline: "wrestling",
  });
  assert.throws(() => plan(f8(), req, { practiceState: { count: 2, xp: 15 } }),
    /F8_DAILY_PRACTICE_LIMIT_REACHED/);
});

test("F8 practice cannot exceed 20 XP per discipline/day", () => {
  const req = request("ATTENDANCE", 10, {
    attendanceSessionId: "attendance-4", sessionId: "mat-1", discipline: "wrestling",
  });
  assert.throws(() => plan(f8(), req, { practiceState: { count: 1, xp: 15 } }),
    /F8_DAILY_PRACTICE_LIMIT_REACHED/);
});

test("separate attendance sessions remain distinct identities", () => {
  const wrestling = request("ATTENDANCE", 10, {
    attendanceSessionId: "wrestling-session", sessionId: "mat-1",
  });
  const kickboxing = request("ATTENDANCE", 10, {
    attendanceSessionId: "kickboxing-session", sessionId: "mat-2",
  });
  assert.notEqual(requestAwardIdentity(wrestling), requestAwardIdentity(kickboxing));
});

test("same-day Combat and Strength use independent policy lanes", () => {
  const combat = plan(f8(), request("ATTENDANCE", 10, {
    attendanceSessionId: "combat-session", sessionId: "mat-1",
  }), { practiceState: {} });
  const strength = plan(f8(), request("STRENGTH", 10, { key: "strength_session1" }));
  assert.equal(combat.monthlyField, "attendance");
  assert.equal(strength.monthlyField, "strength");
  assert.equal(strength.afterXp, 110);
});

test("youth mixed and single-pillar assignments award exactly +5 to the declared primary lane", () => {
  for (const entry of [
    youthAssignment({ strengthMinutes: 18, honorMinutes: 12 }),
    youthAssignment({ strengthMinutes: 20, honorMinutes: 10 }),
    youthAssignment({ strengthMinutes: 30, honorMinutes: 0 }),
  ]) {
    assert.equal(deriveYouthAssignmentAward(entry, "STRENGTH"), 5);
    assert.throws(() => deriveYouthAssignmentAward(entry, "HONOR"), /PRIMARY_LANE_MISMATCH/);
  }

  const honorPrimary = youthAssignment({
    primaryLane: "honor", strengthMinutes: 12, honorMinutes: 18,
  });
  assert.equal(deriveYouthAssignmentAward(honorPrimary, "HONOR"), 5);
  assert.throws(() => deriveYouthAssignmentAward(honorPrimary, "STRENGTH"), /PRIMARY_LANE_MISMATCH/);
});

test("youth assignment validation enforces a 30-minute combined maximum", () => {
  assert.throws(() => deriveYouthAssignmentAward(youthAssignment({
    strengthMinutes: 20, honorMinutes: 11, totalMinutes: 31,
  }), "STRENGTH"), /DURATION_INVALID/);
  assert.throws(() => deriveYouthAssignmentAward(youthAssignment({
    primaryLane: "honor", strengthMinutes: 30, honorMinutes: 0,
  }), "HONOR"), /DURATION_INVALID/);
  assert.throws(() => deriveYouthAssignmentAward(
    youthAssignment({ primaryLane: "honor" }),
    "STRENGTH",
    youthAssignment()
  ), /COMPLETION_MISMATCH/);
});

test("one youth assignment has one receipt identity regardless of requested lane", () => {
  const strength = request("STRENGTH", 5, { key: "conditioning-1", assignmentId: "assignment-1" });
  const honor = request("HONOR", 5, { key: "conditioning-1", assignmentId: "assignment-1" });
  assert.equal(requestAwardIdentity(strength), "youth-assignment:assignment-1");
  assert.equal(requestAwardIdentity(strength), requestAwardIdentity(honor));
});

test("F8 tournament participation aliases share one receipt identity", () => {
  const battle = request("ARENA/BATTLE", 10, { tournamentId: "event-1" });
  const weekend = request("ARENA/WEEKEND_BATTLE", 15, { tournamentId: "event-1" });
  assert.equal(requestAwardIdentity(battle), requestAwardIdentity(weekend));
});

test("F8 Weekend Battle remains 15 and reaches 20 with either exclusive bonus", () => {
  const athlete = f8();
  for (const bonusKind of ["ARENA/PODIUM", "ARENA/SECOND_DIVISION"]) {
    const participation = plan(athlete,
      request("ARENA/WEEKEND_BATTLE", 15, { tournamentId: `event-${bonusKind}` }), {
        arenaEventState: { xp: 0, kinds: {} },
      });
    const bonus = plan(athlete,
      request(bonusKind, 5, { tournamentId: `event-${bonusKind}` }), {
        arenaEventState: participation.arenaEventStateAfter,
      });
    assert.equal(participation.delta, 15);
    assert.equal(bonus.arenaEventStateAfter.xp, 20);
  }
});

test("Sunday Arena competition remains accepted", () => {
  const sunday = plan(f8(), request("ARENA/WEEKEND_BATTLE", 15, {
    tournamentId: "event-sunday",
  }), { arenaEventState: { xp: 0, kinds: {} } });
  assert.equal(sunday.delta, 15);
});

test("F8 tournament layers award once and podium excludes second division", () => {
  const athlete = f8();
  const podium = plan(athlete, request("ARENA/PODIUM", 5, { tournamentId: "event-2" }), {
    arenaEventState: { xp: 0, kinds: {} },
  });
  const participation = plan(athlete, request("ARENA/BATTLE", 10, { tournamentId: "event-2" }), {
    arenaEventState: podium.arenaEventStateAfter,
  });
  assert.deepEqual([podium.delta, participation.delta], [5, 10]);
  assert.throws(() => plan(athlete,
    request("ARENA/SECOND_DIVISION", 5, { tournamentId: "event-2" }), {
      arenaEventState: participation.arenaEventStateAfter,
    }), /PODIUM_SECOND_DIVISION_MUTUALLY_EXCLUSIVE/);
});

test("podium and second division remain available on separate event-day IDs", () => {
  const athlete = f8();
  const podiumDay = plan(athlete, request("ARENA/PODIUM", 5, { tournamentId: "event-friday" }), {
    arenaEventState: { xp: 0, kinds: {} },
  });
  const secondDay = plan(athlete, request("ARENA/SECOND_DIVISION", 5, {
    tournamentId: "event-saturday",
  }), { arenaEventState: { xp: 0, kinds: {} } });
  assert.equal(podiumDay.delta, 5);
  assert.equal(secondDay.delta, 5);
});

test("podium and second division identify each other as the exclusive bonus", () => {
  assert.equal(conflictingArenaBonusKind("ARENA/PODIUM"), "ARENA/SECOND_DIVISION");
  assert.equal(conflictingArenaBonusKind("ARENA/SECOND_DIVISION"), "ARENA/PODIUM");
  assert.equal(conflictingArenaBonusKind("ARENA/WEEKEND_BATTLE"), null);
});

test("repeated podium and second-division layers are rejected by aggregate policy", () => {
  for (const kind of ["ARENA/PODIUM", "ARENA/SECOND_DIVISION"]) {
    assert.throws(() => plan(f8(), request(kind, 5, { tournamentId: "event-3" }), {
      arenaEventState: { xp: 5, kinds: { [kind]: true } },
    }), /F8_TOURNAMENT_LAYER_ALREADY_AWARDED/);
  }
});

test("F8 tournament progression cannot exceed 20", () => {
  assert.throws(() => plan(f8(), request("ARENA/PODIUM", 5, { tournamentId: "event-4" }), {
    arenaEventState: { xp: 20, kinds: {} },
  }), /F8_TOURNAMENT_XP_MAX_REACHED/);
});

test("F8 Shadow regular competition remains capped at zero", () => {
  assert.throws(() => plan(f8({ tier: "T0", xpCap: 800 }),
    request("ARENA/BATTLE", 10, { tournamentId: "event-5" }), {
      arenaEventState: { xp: 0, kinds: {} },
    }), /MONTHLY_ARENA_CAP_REACHED/);
});

test("championship cumulative calls award only their remaining delta", () => {
  assert.deepEqual([
    remainingChampionshipDelta(15, 0),
    remainingChampionshipDelta(30, 15),
    remainingChampionshipDelta(50, 30),
    remainingChampionshipDelta(30, 50),
    remainingChampionshipDelta(50, 50),
  ], [15, 15, 20, 0, 0]);
});

test("Declared and circuit championships have distinct stable identities", () => {
  const circuit = request("CHAMPIONSHIP/CHAMPION", undefined, {
    tournamentId: "nationals", source: "championship-arena", matchCount: 3,
  });
  const declared = request("CHAMPIONSHIP/CHAMPION", undefined, {
    tournamentId: "nationals", source: "declared-championship", matchCount: 3,
  });
  assert.notEqual(requestAwardIdentity(circuit), requestAwardIdentity(declared));
  assert.match(requestAwardIdentity(declared), /declared-championship/);
});

test("trusted Strength classification derives +5 and +10 server-side", () => {
  assert.equal(deriveTrustedStrengthAmount({ lane: "conditioning", rounds: 4 }), 5);
  assert.equal(deriveTrustedStrengthAmount({ lane: "strength", kind: "remote_hiit" }), 5);
  assert.equal(deriveTrustedStrengthAmount({ lane: "strength", kind: "iron" }), 10);
  assert.equal(deriveTrustedStrengthAmount({ lane: "strength", main: "Back squat 5x5" }), 10);
});

test("unclassified Strength fails closed and client amount is not a classification source", () => {
  assert.throws(() => deriveTrustedStrengthAmount({ lane: "strength", body: "Did work" }),
    /UNCLASSIFIED_STRENGTH_SUBMISSION/);
  assert.throws(() => deriveTrustedStrengthAmount({ lane: "strength", amount: 999 }),
    /UNCLASSIFIED_STRENGTH_SUBMISSION/);
});

test("duplicate results suppress parent and leaderboard side effects", () => {
  assert.equal(shouldEmitAwardSideEffects({ idempotent: true }), false);
  assert.equal(shouldEmitAwardSideEffects({ idempotent: false }), true);
  const source = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
  assert.match(source, /if \(shouldEmitAwardSideEffects\(result\)\) try/);
  assert.match(source, /if \(shouldEmitAwardSideEffects\(result\)\) await emitParentSignalsBestEffort/);
});

test("transactional receipt and aggregate state are written with athlete.xp as active authority", () => {
  const source = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
  assert.match(source, /db\.collection\("xpAwardReceipts"\)/);
  assert.match(source, /tx\.create\(receiptRef/);
  assert.match(source, /const beforeXp = resolveAuthoritativeActiveRankXp\(athlete\)/);
  assert.doesNotMatch(source, /beforeXp\s*=.*xpDaily.*xpArena/);
});

test("F4 practice keeps the existing two-session safeguard", () => {
  const req = normalizeXpRequest({ uid: "F4_2000", kind: "ATTENDANCE", amount: 10,
    meta: { attendanceSessionId: "f4-session", sessionId: "mat-1", durationMinutes: 120 } });
  assert.throws(() => plan(f4(), req, { practiceState: { count: 2, xp: 20 } }),
    /DAILY_GRIND_XP_LIMIT/);
});
