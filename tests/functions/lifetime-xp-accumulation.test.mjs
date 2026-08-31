import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveLifetimeXpAccumulation,
} from "../../functions/lib/policy/xpDomainPolicy.js";
import {
  buildAwardPlan,
  normalizeXpRequest,
} from "../../functions/lib/services/authoritativeXpService.js";

const serviceSource = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
const promotionSource = readFileSync("functions/src/modules/promotion/promoteTierAction.ts", "utf8");

function f8(overrides = {}) {
  const tier = overrides.progressionTier ?? overrides.tier ?? "T0";
  return { uid: "F8_LIFE", trackBase: "F8", tier, progressionTier: tier,
    xp: 100, lifetimeXp: 2400, ...overrides };
}

function request(kind, amount, meta = {}) {
  return normalizeXpRequest({ uid: "F8_LIFE", kind, amount, meta });
}

test("positive Active Rank XP accumulates Lifetime XP 1:1", () => {
  assert.deepEqual(resolveLifetimeXpAccumulation(f8(), 100, 110), {
    before: 2400, after: 2410, delta: 10,
  });
});

test("partial cap uses the actual Active Rank delta", () => {
  const athlete = f8({ xp: 795 });
  const plan = buildAwardPlan({ athlete, athleteId: athlete.uid,
    request: request("ATTENDANCE", 10), monthly: {} });
  assert.equal(plan.afterXp - plan.beforeXp, 5);
  assert.deepEqual(resolveLifetimeXpAccumulation(athlete, plan.beforeXp, plan.afterXp), {
    before: 2400, after: 2405, delta: 5,
  });
});

test("zero and negative Active Rank deltas never change Lifetime XP", () => {
  assert.equal(resolveLifetimeXpAccumulation(f8(), 100, 100).delta, 0);
  assert.deepEqual(resolveLifetimeXpAccumulation(f8(), 100, 75), {
    before: 2400, after: 2400, delta: 0,
  });
});

test("missing Lifetime XP starts at zero for new accumulation", () => {
  assert.deepEqual(resolveLifetimeXpAccumulation({ xp: 100 }, 100, 110), {
    before: 0, after: 10, delta: 10,
  });
});

test("legacy totals and source buckets never initialize Lifetime XP", () => {
  const athlete = { xp: 100, xpLifetime: 9000, totalLifetimeXp: 8000,
    xpTotal: 7000, totalXP: 6000, xpDaily: 5000, xpArena: 4000,
    xpStrength: 3000, xpHonor: 2000 };
  assert.deepEqual(resolveLifetimeXpAccumulation(athlete, 100, 110), {
    before: 0, after: 10, delta: 10,
  });
});

test("F8 Strength and Honor accumulate from their actual Active Rank delta", () => {
  for (const [kind, amount] of [["STRENGTH", 10], ["HONOR", 5]]) {
    const athlete = f8();
    const plan = buildAwardPlan({ athlete, athleteId: athlete.uid,
      request: request(kind, amount), monthly: {} });
    assert.equal(resolveLifetimeXpAccumulation(athlete, plan.beforeXp, plan.afterXp).delta, amount);
  }
});

test("F4 separate Strength and Honor buckets do not add Lifetime XP", () => {
  const athlete = { uid: "F4_LIFE", trackBase: "F4", tier: "T1", xp: 100,
    xpCap: 1600, lifetimeXp: 900 };
  const plan = buildAwardPlan({ athlete, athleteId: athlete.uid,
    request: normalizeXpRequest({ uid: athlete.uid, kind: "STRENGTH", amount: 10 }), monthly: {} });
  assert.equal(plan.afterXp, plan.beforeXp);
  assert.equal(resolveLifetimeXpAccumulation(athlete, plan.beforeXp, plan.afterXp).delta, 0);
});

test("Arena and Championship awards accumulate when Active Rank XP increases", () => {
  const athlete = f8({ tier: "T1" });
  const arena = buildAwardPlan({ athlete, athleteId: athlete.uid,
    request: request("ARENA/BATTLE", 10, { tournamentId: "arena-1" }), monthly: {} });
  const championship = buildAwardPlan({ athlete, athleteId: athlete.uid,
    request: request("CHAMPIONSHIP/COMPETE", 15, { tournamentId: "champ-1" }), monthly: {} });
  assert.equal(resolveLifetimeXpAccumulation(athlete, arena.beforeXp, arena.afterXp).delta, 10);
  assert.equal(resolveLifetimeXpAccumulation(athlete, championship.beforeXp, championship.afterXp).delta, 15);
});

test("authoritative write, logs, and receipt use one transactional Lifetime delta", () => {
  assert.match(serviceSource, /resolveLifetimeXpAccumulation\(athlete, plan\.beforeXp, plan\.afterXp\)/);
  assert.match(serviceSource, /if \(lifetimeXp\.delta > 0\) athletePatch\.lifetimeXp = lifetimeXp\.after/);
  assert.match(serviceSource, /lifetimeXpBefore: lifetimeXp\.before/);
  assert.match(serviceSource, /lifetimeXpAfter: lifetimeXp\.after/);
  assert.match(serviceSource, /lifetimeXpDelta: lifetimeXp\.delta/);
  assert.doesNotMatch(serviceSource, /xpLifetime\s*:|totalLifetimeXp\s*:|xpTotal\s*:|totalXP\s*:/);
});

test("duplicate receipt return occurs before Lifetime XP calculation and writes", () => {
  assert.ok(serviceSource.indexOf("if (receiptSnap.exists)")
    < serviceSource.indexOf("const lifetimeXp = resolveLifetimeXpAccumulation"));
  assert.match(serviceSource, /duplicate: true,[\s\S]{0,180}lifetimeXpDelta: 0/);
});

test("promotion resets Active Rank XP without writing or resetting Lifetime XP", () => {
  assert.match(promotionSource, /\bxp: 0,/);
  assert.doesNotMatch(promotionSource, /lifetimeXp\s*:/);
  assert.deepEqual(resolveLifetimeXpAccumulation({ xp: 0, lifetimeXp: 2400 }, 0, 10), {
    before: 2400, after: 2410, delta: 10,
  });
});

test("invalid canonical Lifetime XP fails closed instead of using aliases", () => {
  assert.throws(() => resolveLifetimeXpAccumulation({ lifetimeXp: -1, xpLifetime: 99 }, 0, 10),
    /INVALID_LIFETIME_XP/);
});
