import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildHistoricalLifetimeCombatDisciplineSet,
  buildLifetimeCombatDisciplineUpdate,
  normalizeLifetimeCombatDiscipline,
  resolveLifetimeCombatDisciplineState,
} from "../../functions/lib/policy/lifetimeCombatDisciplinePolicy.js";
import { resolveLifetimeXpEffects } from "../../functions/lib/policy/xpDomainPolicy.js";
import {
  assignedLifetimeCombatDisciplines,
  isLifetimeComponentMode,
  lifetimeBreakdownFor,
  leaderboardScore,
} from "../../public/athletes/leaderboard/leaderboard-scoring.js";

function effects(athlete, delta = 10, semantic = "NEW_EARNED_XP") {
  return resolveLifetimeXpEffects({ athlete, domain: "COMBAT",
    operationalDelta: delta, semantic });
}

test("approved aliases resolve to canonical discipline IDs", () => {
  for (const value of ["Muay Thai", "muay_thai", "muay-thai", "kickboxing", "kickbox"])
    assert.equal(normalizeLifetimeCombatDiscipline(value), "muay-thai");
  assert.equal(normalizeLifetimeCombatDiscipline("BJJ"), "submission-grappling");
  assert.equal(normalizeLifetimeCombatDiscipline("MMA"), "mma");
});

test("unknown Combat discipline fails closed", () => {
  assert.throws(() => normalizeLifetimeCombatDiscipline("combat-1"),
    /UNKNOWN_LIFETIME_COMBAT_DISCIPLINE/);
});

test("map-absent transitional award records ownership without creating a partial map", () => {
  const athlete = { lifetimeCombatXp: 100, lifetimeXpSchemaVersion: "domain-components-v1",
    lifetimeLegacyXp: 0, lifetimeXp: 100 };
  const update = buildLifetimeCombatDisciplineUpdate({ athlete, discipline: "wrestling",
    effects: effects(athlete) });
  assert.equal(update.canonicalDiscipline, "wrestling");
  assert.equal(update.disciplineMapApplied, false);
  assert.deepEqual(update.patch, {});
});

test("reconciled single-discipline award updates map and aggregate invariant once", () => {
  const athlete = { lifetimeCombatByDiscipline: { wrestling: 100 }, lifetimeCombatXp: 100,
    lifetimeXpSchemaVersion: "domain-components-v1", lifetimeLegacyXp: 0, lifetimeXp: 100 };
  const update = buildLifetimeCombatDisciplineUpdate({ athlete, discipline: "wrestling",
    effects: effects(athlete) });
  assert.deepEqual(update.patch, { lifetimeCombatByDiscipline: { wrestling: 110 } });
  assert.equal(update.mapTotalAfter, 110);
  assert.equal(update.disciplineLifetimeBefore, 100);
  assert.equal(update.disciplineLifetimeAfter, 110);
});

test("reconciled secondary discipline increments only its canonical bucket", () => {
  const athlete = { lifetimeCombatByDiscipline: { wrestling: 100, boxing: 20 },
    lifetimeCombatXp: 120, lifetimeXpSchemaVersion: "domain-components-v1",
    lifetimeLegacyXp: 0, lifetimeXp: 120 };
  const update = buildLifetimeCombatDisciplineUpdate({ athlete, discipline: "boxing",
    effects: effects(athlete, 5) });
  assert.deepEqual(update.patch.lifetimeCombatByDiscipline, { wrestling: 100, boxing: 25 });
});

test("muay-thai is stored as one validated literal map key", () => {
  const athlete = { lifetimeCombatByDiscipline: {}, lifetimeCombatXp: 0,
    lifetimeXpSchemaVersion: "domain-components-v1", lifetimeLegacyXp: 0, lifetimeXp: 0 };
  const update = buildLifetimeCombatDisciplineUpdate({ athlete, discipline: "kickboxing",
    effects: effects(athlete, 10) });
  assert.deepEqual(update.patch.lifetimeCombatByDiscipline, { "muay-thai": 10 });
});

test("Strength and Honor integration never require or mutate a Combat map", () => {
  for (const domain of ["STRENGTH", "HONOR"]) {
    const result = resolveLifetimeXpEffects({ athlete: {}, domain,
      operationalDelta: 5, semantic: "NEW_EARNED_XP" });
    assert.equal(result.domain, domain);
    assert.equal(Object.hasOwn(result.stateAfter, "lifetimeCombatByDiscipline"), false);
  }
});

test("restore and operational deduction leave a reconciled map unchanged", () => {
  const athlete = { lifetimeCombatByDiscipline: { wrestling: 100 }, lifetimeCombatXp: 100,
    lifetimeXpSchemaVersion: "domain-components-v1", lifetimeLegacyXp: 0, lifetimeXp: 100 };
  for (const semantic of ["RESTORE_ALREADY_COUNTED_XP", "OPERATIONAL_DEDUCTION"]) {
    const update = buildLifetimeCombatDisciplineUpdate({ athlete, discipline: "wrestling",
      effects: effects(athlete, semantic === "OPERATIONAL_DEDUCTION" ? -5 : 5, semantic) });
    assert.equal(update.disciplineMapApplied, false);
    assert.deepEqual(update.patch, {});
  }
});

test("map validation rejects unknown keys and invalid XP values", () => {
  assert.throws(() => resolveLifetimeCombatDisciplineState({
    lifetimeCombatByDiscipline: { kickboxing: 10 }, lifetimeCombatXp: 10,
  }), /UNKNOWN_LIFETIME_COMBAT_DISCIPLINE_KEY/);
  for (const value of [-1, 1.5, Infinity]) assert.throws(() =>
    resolveLifetimeCombatDisciplineState({ lifetimeCombatByDiscipline: { wrestling: value },
      lifetimeCombatXp: value }), /INVALID_LIFETIME_COMBAT_DISCIPLINE_XP/);
});

test("map and aggregate mismatch fails closed", () => {
  assert.throws(() => resolveLifetimeCombatDisciplineState({
    lifetimeCombatByDiscipline: { wrestling: 99 }, lifetimeCombatXp: 100,
  }), /LIFETIME_COMBAT_DISCIPLINE_INVARIANT_VIOLATION/);
});

test("map absence remains readable without fabricating ownership", () => {
  assert.deepEqual(resolveLifetimeCombatDisciplineState({ lifetimeCombatXp: 500 }), {
    mapPresent: false, mapValid: true, mapTotal: 0, byDiscipline: {},
  });
});

test("historical reconciliation validates a final SET allocation", () => {
  assert.deepEqual(buildHistoricalLifetimeCombatDisciplineSet({
    byDiscipline: { wrestling: 2185, boxing: 340 }, lifetimeCombatXp: 2525,
  }), { wrestling: 2185, boxing: 340 });
});

test("production writers record forward discipline attribution and avoid athlete special cases", () => {
  const authoritative = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
  const management = readFileSync("functions/src/management/managementXpTools.ts", "utf8");
  for (const source of [authoritative, management]) {
    assert.match(source, /canonicalLifetimeCombatDiscipline/);
    assert.match(source, /disciplineMapApplied/);
    assert.doesNotMatch(source, /F4_0001|Maximus|F8_0001|Sampson|Fabian|David McKinney/);
  }
});

test("recognized prior experience uses componentized Combat semantics", () => {
  const source = readFileSync("functions/src/management/managementXpTools.ts", "utf8");
  assert.match(source, /semantic: "RECOGNIZED_PRIOR_EXPERIENCE"/);
  assert.doesNotMatch(source, /resolveLifetimeXpAccumulation/);
});

test("leaderboard reads overall and component Lifetime authority without active-XP fallback", () => {
  const source = readFileSync("public/athletes/leaderboard/leaderboard.app.js", "utf8");
  assert.match(source, /lifetimeXp/);
  assert.match(source, /lifetimeCombatByDiscipline/);
  const athlete = {
    xp: 9999,
    primaryDiscipline: "wrestling",
    lifetimeXp: 2615,
    lifetimeCombatXp: 2525,
    lifetimeCombatByDiscipline: { wrestling: 2185, boxing: 340 },
    lifetimeStrengthXp: 60,
    lifetimeHonorXp: 30,
  };
  assert.equal(leaderboardScore(athlete, "lifetime"), 2615);
  assert.equal(leaderboardScore(athlete, "wrestling"), 2185);
  assert.equal(leaderboardScore(athlete, "boxing"), 340);
  assert.equal(leaderboardScore(athlete, "strength"), 60);
  assert.equal(leaderboardScore(athlete, "honor"), 30);
  assert.equal(leaderboardScore(athlete, "muay-thai"), 0);
});

test("discipline leaderboard never infers missing ownership", () => {
  const activeOnly = { xp: 700, primaryDiscipline: "wrestling",
    activeDiscipline: "wrestling", discipline: "wrestling", lifetimeCombatXp: 700 };
  assert.equal(leaderboardScore(activeOnly, "wrestling"), 0);
  assert.equal(leaderboardScore({ lifetimeCombatByDiscipline: { boxing: 25 } }, "wrestling"), 0);
  assert.equal(leaderboardScore(activeOnly, "strength"), 0);
  assert.equal(leaderboardScore(activeOnly, "honor"), 0);
  for (const mode of ["wrestling", "boxing", "muay-thai", "submission-grappling",
    "mma", "strength", "honor"]) assert.equal(isLifetimeComponentMode(mode), true);
});

test("progression scoring remains active XP only", () => {
  assert.equal(leaderboardScore({ xp: 415, lifetimeXp: 9000 }, "progression"), 415);
});

test("Lifetime breakdown visibility follows assignments while scores follow the map", () => {
  const maximus = {
    disciplineIds: ["wrestling", "boxing"],
    primaryDiscipline: "muay-thai",
    lifetimeXp: 2615,
    lifetimeCombatXp: 2525,
    lifetimeCombatByDiscipline: { wrestling: 2185, boxing: 340, "muay-thai": 99 },
    lifetimeStrengthXp: 60,
    lifetimeHonorXp: 30,
  };
  assert.deepEqual(assignedLifetimeCombatDisciplines(maximus), ["wrestling", "boxing"]);
  assert.equal(leaderboardScore(maximus, "wrestling"), 2185);
  assert.equal(leaderboardScore(maximus, "boxing"), 340);
  assert.deepEqual(lifetimeBreakdownFor(maximus), {
    lifetimeXp: 2615,
    combatXp: 2525,
    disciplines: [
      { discipline: "wrestling", xp: 2185 },
      { discipline: "boxing", xp: 340 },
    ],
    strengthXp: 60,
    honorXp: 30,
  });

  const sampson = {
    disciplines: { wrestling: {}, kickboxing: {} },
    discipline: "boxing",
    lifetimeCombatByDiscipline: { wrestling: 235, "muay-thai": 0 },
  };
  assert.deepEqual(assignedLifetimeCombatDisciplines(sampson), ["wrestling", "muay-thai"]);
  assert.equal(leaderboardScore(sampson, "muay-thai"), 0);
  assert.deepEqual(lifetimeBreakdownFor(sampson).disciplines, [
    { discipline: "wrestling", xp: 235 },
    { discipline: "muay-thai", xp: 0 },
  ]);
  assert.equal(assignedLifetimeCombatDisciplines({ primaryDiscipline: "boxing" }).length, 0);
});
