import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CHAMPIONSHIP_TOTALS,
  activeXpCap,
  buildParentSignalInputs,
  buildAwardPlan,
  classifyAthlete,
  dispatchAuthoritativeXp,
  emitParentSignalsBestEffort,
  normalizeXpRequest,
  persistedStripeCount,
} from "../../functions/lib/services/authoritativeXpService.js";

const f4 = (overrides = {}) => ({
  uid: "F4_1000", trackBase: "F4", tier: "T0", xp: 100, xpCap: 1000,
  xpDaily: 900, xpArena: 500, xpFightIQ: 200, ...overrides,
});
const f8 = (overrides = {}) => ({
  uid: "F8_1000", trackBase: "F8", tier: "T0", xp: 100, xpCap: 600,
  xpDaily: 900, xpArena: 500, xpFightIQ: 200, ...overrides,
});
const req = (kind, amount, meta = {}) => normalizeXpRequest({
  uid: "athlete", kind, amount, meta,
});
const plan = (athlete, request, monthly = {}, championshipAwarded = 0, extra = {}) =>
  buildAwardPlan({ athlete, athleteId: athlete.uid, request, monthly, championshipAwarded, ...extra });

test("classification is positive and fails closed for ambiguous or unknown athletes", () => {
  assert.equal(classifyAthlete(f4()), "F4");
  assert.equal(classifyAthlete(f8()), "F8");
  assert.equal(classifyAthlete({ uid: "A_1", trackBase: "ADULT" }), "ADULT");
  assert.throws(() => classifyAthlete({ uid: "F8_1", trackBase: "F4" }), /AMBIGUOUS/);
  assert.throws(() => classifyAthlete({ uid: "X_1" }), /UNCLASSIFIED/);
});

test("HTTP and callable adapters share the same authoritative dispatcher contract", async () => {
  const calls = [];
  const mockAward = async (coachUid, payload) => {
    calls.push({ coachUid, payload });
    return { ok: true, afterXp: 10 };
  };
  const httpResult = await dispatchAuthoritativeXp("http-coach", { uid: "F4_1" }, mockAward);
  const callableResult = await dispatchAuthoritativeXp("callable-coach", { uid: "F4_2" }, mockAward);
  assert.deepEqual(httpResult, callableResult);
  assert.deepEqual(calls.map((call) => call.coachUid), ["http-coach", "callable-coach"]);
});

test("live HTTP and callable modules import the same dispatcher", () => {
  const http = readFileSync("functions/src/modules/xpHttp.ts", "utf8");
  const callable = readFileSync("functions/src/modules/incrementXp.ts", "utf8");
  assert.match(http, /dispatchAuthoritativeXp/);
  assert.match(callable, /dispatchAuthoritativeXp/);
  assert.doesNotMatch(http, /runIncrementXp/);
  assert.match(callable, /if \(!kind\.startsWith\("DEV\/"\)\)/);
});

test("qualifying awards attempt the existing attendance, stripe, and eligibility signals", () => {
  const signals = buildParentSignalInputs({ uid: "F4_1", athleteName: "Athlete",
    kind: "ATTENDANCE", delta: 10, logId: "log-1", becameEligible: true,
    earnedStripe: true, stripeCount: 4 });
  assert.deepEqual(signals.map((signal) => signal.type), [
    "TESTING_ELIGIBLE", "XP_MILESTONE", "DAILY_GRIND_LOGGED",
  ]);
  assert.equal(signals[1].stripeCount, 4);
  assert.equal(signals[2].amount, 10);
});

test("parent-signal failure is swallowed after a successful XP result", async () => {
  let attempts = 0;
  await assert.doesNotReject(() => emitParentSignalsBestEffort({
    uid: "F4_1", kind: "ATTENDANCE", delta: 10, logId: "log-1",
    becameEligible: false, earnedStripe: false,
  }, async () => {
    attempts += 1;
    throw new Error("notification unavailable");
  }));
  assert.equal(attempts, 1);
});

test("authoritative service contains no migration or curriculum dependency", () => {
  const source = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
  assert.doesNotMatch(source, /migrat/i);
  assert.doesNotMatch(source, /curriculum/i);
  assert.doesNotMatch(source, /promoteTier|PROMOTE/);
});

test("F8 caps come only from the Phase 1 five-rank policy", () => {
  assert.equal(activeXpCap(f8({ tier: "T0", xpCap: 600 }), "F8"), 800);
  assert.equal(activeXpCap(f8({ tier: "T4", xpCap: 1400 }), "F8"), 3400);
  assert.throws(() => activeXpCap(f8({ tier: "T7" }), "F8"), /Unknown Foundry 8 rank/);
});

test("active XP begins at athlete.xp and never reconstructs source buckets", () => {
  const out = plan(f4({ xp: 100, xpDaily: 900, xpArena: 500 }), req("ATTENDANCE", 10));
  assert.equal(out.beforeXp, 100);
  assert.equal(out.afterXp, 110);
});

test("F4 Strength accepts +5/+10, leaves main XP unchanged, and caps at 120", () => {
  for (const amount of [5, 10]) {
    const out = plan(f4(), req("STRENGTH", amount), { strength: 100 });
    assert.equal(out.afterXp, 100);
    assert.equal(out.delta, amount);
  }
  assert.throws(() => plan(f4(), req("STRENGTH", 7)), /must be 5 or 10/);
  assert.throws(() => plan(f4(), req("STRENGTH", 10), { strength: 115 }), /CAP_REACHED/);
});

test("F4 apprentice and existing daily practice ceilings remain enforced", () => {
  assert.throws(() => plan(f4(), req("ATTENDANCE", 15, { durationMinutes: 120 })),
    /APPRENTICE_PRACTICE/);
  const veteran = f4({ tier: "T1", xpCap: 1600 });
  assert.equal(plan(veteran, req("ATTENDANCE", 10, { durationMinutes: 90 }), {}, 0,
    { practiceState: { count: 1, xp: 5 } }).practiceStateAfter.xp, 15);
  assert.throws(() => plan(veteran, req("ATTENDANCE", 10), {}, 0,
    { practiceState: { count: 2, xp: 10 } }), /DAILY_GRIND/);
});

test("F4 Honor retains approved +5/+10 behavior and separate 120 ceiling", () => {
  assert.equal(plan(f4(), req("HONOR", 5), { honor: 115 }).monthlyAfter, 120);
  assert.throws(() => plan(f4(), req("HONOR", 10), { honor: 115 }), /CAP_REACHED/);
  assert.throws(() => plan(f4(), req("HONOR", 15)), /not approved/);
});

test("F4 regular Arena has an 80 monthly ceiling", () => {
  assert.equal(plan(f4(), req("ARENA/BATTLE", 10), { arena: 70 }).monthlyAfter, 80);
  assert.throws(() => plan(f4(), req("ARENA/BATTLE", 10), { arena: 75 }), /MONTHLY_ARENA/);
});

test("F4 stripes persist at the existing 25/50/75/100 boundaries", () => {
  assert.deepEqual([249, 250, 500, 750, 999, 1000].map((xp) =>
    persistedStripeCount("F4", "T0", xp, 1000)), [0, 1, 2, 3, 3, 4]);
  assert.equal(plan(f4({ xp: 740 }), req("ATTENDANCE", 10)).stripeCount, 3);
});

test("F8 stripes use Phase 1 25/50/75/98 boundaries", () => {
  assert.deepEqual([199, 200, 400, 600, 783, 784, 800].map((xp) =>
    persistedStripeCount("F8", "T0", xp, 800)), [0, 1, 2, 3, 3, 4, 4]);
});

test("F8 practice is +5/+10 only and uses active XP", () => {
  assert.equal(plan(f8(), req("ATTENDANCE", 10)).afterXp, 110);
  assert.throws(() => plan(f8(), req("ATTENDANCE", 15)), /not approved/);
});

test("F8 practice permits two qualifying sessions per discipline and no more than 20 daily XP", () => {
  const request = req("ATTENDANCE", 10, { discipline: "wrestling" });
  assert.deepEqual(plan(f8(), request, {}, 0, { practiceState: { count: 1, xp: 10 } }).practiceStateAfter,
    { count: 2, xp: 20 });
  assert.throws(() => plan(f8(), request, {}, 0, { practiceState: { count: 2, xp: 20 } }),
    /DAILY_PRACTICE_LIMIT/);
});

test("F8 Strength and Honor share the Phase 1 monthly ceiling", () => {
  assert.equal(plan(f8(), req("STRENGTH", 10), { strength: 20, honor: 10 }).monthlyAfter, 30);
  assert.throws(() => plan(f8(), req("HONOR", 5), { strength: 20, honor: 20 }), /STRENGTH_HONOR/);
});

test("F8 regular competition uses Phase 1 caps and Style IQ progression is zero", () => {
  assert.throws(() => plan(f8(), req("ARENA/BATTLE", 10)), /MONTHLY_ARENA/);
  const prospect = f8({ tier: "T1", xp: 100, xpCap: 800 });
  const style = plan(prospect, req("ARENA/STYLEIQ", 5), { arena: 50 });
  assert.equal(style.delta, 0);
  assert.equal(style.afterXp, 100);
});

test("F8 tournament progression is limited to 20 with podium and second division once each", () => {
  const prospect = f8({ tier: "T1", xp: 100 });
  const second = req("ARENA/SECOND_DIVISION", 5, { tournamentId: "event" });
  assert.equal(plan(prospect, second, {}, 0, { arenaEventState: { xp: 15, kinds: {} } })
    .arenaEventStateAfter.xp, 20);
  assert.throws(() => plan(prospect, second, {}, 0, {
    arenaEventState: { xp: 10, kinds: { "ARENA/SECOND_DIVISION": true } },
  }), /LAYER_ALREADY_AWARDED/);
  assert.throws(() => plan(prospect, req("ARENA/PODIUM", 5, { tournamentId: "event" }), {}, 0, {
    arenaEventState: { xp: 20, kinds: {} },
  }), /TOURNAMENT_XP_MAX/);
});

test("championship scoring is cumulative 15/30/50 and outside regular Arena monthly usage", () => {
  assert.deepEqual(CHAMPIONSHIP_TOTALS, { COMPETE: 15, PLACE: 30, CHAMPION: 50 });
  const meta = { tournamentId: "event-1", source: "championship-arena", matchCount: 3 };
  const compete = plan(f4(), req("CHAMPIONSHIP/COMPETE", undefined, meta), { arena: 80 });
  const place = plan(f4(), req("CHAMPIONSHIP/PLACE", undefined, meta), { arena: 80 }, 15);
  const champion = plan(f4(), req("CHAMPIONSHIP/CHAMPION", undefined, meta), { arena: 80 }, 30);
  assert.deepEqual([compete.delta, place.delta, champion.delta], [15, 15, 20]);
  assert.ok([compete, place, champion].every((value) => value.monthlyField === null));
});

test("Place and Champion require at least three matches", () => {
  for (const result of ["PLACE", "CHAMPION"]) {
    assert.throws(() => plan(f4(), req(`CHAMPIONSHIP/${result}`, undefined, {
      tournamentId: "event-1", source: "championship-arena", matchCount: 2,
    })), /THREE_MATCHES/);
  }
});

test("Declared Championship uses identical scoring with a distinct source", () => {
  const out = plan(f4(), req("CHAMPIONSHIP/CHAMPION", undefined, {
    tournamentId: "event-2", source: "declared-championship", matchCount: 3,
  }), { arena: 80 });
  assert.equal(out.delta, 50);
  assert.equal(out.source, "declared-championship");
  assert.equal(out.monthlyField, null);
});

test("PRESTIGE maps only with trustworthy current result metadata", () => {
  const mapped = normalizeXpRequest({ uid: "F4_1", kind: "PRESTIGE", amount: 75,
    meta: { tournamentId: "event", result: "CHAMPION", matchCount: 3 } });
  assert.equal(mapped.kind, "CHAMPIONSHIP/CHAMPION");
  assert.equal(mapped.amount, 50);
  assert.equal(mapped.meta.compatibilityKind, "PRESTIGE");
  assert.throws(() => normalizeXpRequest({ uid: "F4_1", kind: "PRESTIGE", amount: 25,
    meta: { level: "state", title: "LION" } }), /PRESTIGE requires/);
});

test("generic TOURNAMENT fails clearly instead of inventing a mapping", () => {
  assert.throws(() => normalizeXpRequest({ uid: "F4_1", kind: "TOURNAMENT", amount: 10,
    meta: { result: "SHOW" } }), /cannot be inferred/);
});

test("reaching a rank cap makes the athlete eligible but does not promote tiers", () => {
  const out = plan(f8({ xp: 795 }), req("ATTENDANCE", 10));
  assert.equal(out.afterXp, 800);
  assert.equal(out.tier, "T0");
  assert.equal(out.stripeCount, 4);
});
