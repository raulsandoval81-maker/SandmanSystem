import test from "node:test";
import assert from "node:assert/strict";

import {
  LIFETIME_XP_SCHEMA_VERSION,
  assertLifetimeInvariant,
  lifetimeXpPatch,
  resolveManagementAdjustmentSemantic,
  resolveLifetimeDomain,
  resolveLifetimeXpEffects,
  resolveLifetimeXpState,
} from "../../functions/lib/policy/xpDomainPolicy.js";

test("Management adjustment categories resolve with fail-closed correction semantics", () => {
  assert.equal(resolveManagementAdjustmentSemantic("delayed_onboarding"), "NEW_EARNED_XP");
  assert.equal(resolveManagementAdjustmentSemantic("paper_reconciliation"), "NEW_EARNED_XP");
  assert.equal(resolveManagementAdjustmentSemantic("downtime_recovery"), "NEW_EARNED_XP");
  assert.equal(resolveManagementAdjustmentSemantic(
    "downtime_recovery", "RESTORE_ALREADY_COUNTED_XP"
  ), "RESTORE_ALREADY_COUNTED_XP");
  assert.throws(
    () => resolveManagementAdjustmentSemantic("correction"),
    /CORRECTION_REQUIRES_EXPLICIT_XP_SEMANTIC/
  );
  assert.equal(resolveManagementAdjustmentSemantic(
    "correction", "REVERSE_ERRONEOUS_AWARD"
  ), "REVERSE_ERRONEOUS_AWARD");
});

test("canonical award kinds resolve to exactly one lifetime domain", () => {
  for (const kind of ["ATTENDANCE", "DAILY_GRIND", "ARENA/BATTLE",
    "ARENA/WEEKEND_BATTLE", "ARENA/PODIUM", "ARENA/SECOND_DIVISION",
    "ARENA/STYLEIQ", "ARENA/EXTRA", "ARENA/FORFEIT_WIN",
    "ARENA/NO_OPP_DAY", "ARENA/SPORTSMANSHIP", "CHAMPIONSHIP/COMPETE",
    "CHAMPIONSHIP/PLACE", "CHAMPIONSHIP/CHAMPION"]) {
    assert.equal(resolveLifetimeDomain(kind), "COMBAT");
  }
  assert.equal(resolveLifetimeDomain("STRENGTH"), "STRENGTH");
  assert.equal(resolveLifetimeDomain("HONOR"), "HONOR");
  assert.throws(() => resolveLifetimeDomain("UNKNOWN"), /UNRESOLVED_LIFETIME_DOMAIN/);
});

test("legacy combined lifetime is preserved as an unreconciled baseline", () => {
  assert.deepEqual(resolveLifetimeXpState({ lifetimeXp: 500 }), {
    legacy: 500, combat: 0, strength: 0, honor: 0, combined: 500,
    reconciliationStatus: "legacy_unreconciled",
  });
});

test("new Strength award accrues one component without inferring legacy domain", () => {
  const effects = resolveLifetimeXpEffects({
    athlete: { lifetimeXp: 500 }, domain: "STRENGTH", operationalDelta: 5,
  });
  assert.equal(effects.componentBefore, 0);
  assert.equal(effects.componentAfter, 5);
  assert.equal(effects.combinedBefore, 500);
  assert.equal(effects.combinedAfter, 505);
  assert.deepEqual(lifetimeXpPatch(effects), {
    lifetimeStrengthXp: 5,
    lifetimeLegacyXp: 500,
    lifetimeXp: 505,
    lifetimeXpSchemaVersion: LIFETIME_XP_SCHEMA_VERSION,
    lifetimeXpReconciliationStatus: "legacy_unreconciled",
  });
});

test("F4 and F8 domain ownership is independent of visible progression shape", () => {
  for (const domain of ["COMBAT", "STRENGTH", "HONOR"]) {
    const effects = resolveLifetimeXpEffects({ athlete: {}, domain, operationalDelta: 5 });
    assert.equal(effects.lifetimeComponentDelta, 5);
    assert.equal(effects.combinedLifetimeDelta, 5);
    assert.equal(effects.combinedAfter, 5);
  }
});

test("restore and operational deduction never increase lifetime", () => {
  for (const semantic of ["RESTORE_ALREADY_COUNTED_XP", "OPERATIONAL_DEDUCTION"]) {
    const effects = resolveLifetimeXpEffects({
      athlete: { lifetimeXp: 100 }, domain: "COMBAT",
      operationalDelta: semantic === "OPERATIONAL_DEDUCTION" ? -5 : 5,
      semantic,
    });
    assert.equal(effects.lifetimeComponentDelta, 0);
    assert.equal(effects.combinedAfter, 100);
  }
});

test("recognized prior experience counts once in Combat lifetime", () => {
  const effects = resolveLifetimeXpEffects({ athlete: {}, domain: "COMBAT",
    operationalDelta: 200, semantic: "RECOGNIZED_PRIOR_EXPERIENCE" });
  assert.equal(effects.componentAfter, 200);
  assert.equal(effects.combinedAfter, 200);
});

test("historical reconciliation changes lifetime without operational XP", () => {
  const effects = resolveLifetimeXpEffects({ athlete: { lifetimeXp: 120 }, domain: "COMBAT",
    operationalDelta: 0, lifetimeDelta: 1000,
    semantic: "HISTORICAL_LIFETIME_RECONCILIATION" });
  assert.equal(effects.operationalDelta, 0);
  assert.equal(effects.lifetimeComponentDelta, 1000);
  assert.equal(effects.combinedAfter, 1120);
});

test("reversal is bounded and domain reclassification requires a two-component transaction", () => {
  const athlete = { lifetimeXpSchemaVersion: LIFETIME_XP_SCHEMA_VERSION,
    lifetimeLegacyXp: 0, lifetimeXp: 10, lifetimeCombatXp: 10 };
  const reversal = resolveLifetimeXpEffects({ athlete, domain: "COMBAT",
    operationalDelta: -5, lifetimeDelta: -5, semantic: "REVERSE_ERRONEOUS_AWARD" });
  assert.equal(reversal.componentAfter, 5);
  assert.equal(reversal.combinedAfter, 5);
  assert.throws(() => resolveLifetimeXpEffects({ athlete, domain: "COMBAT",
    operationalDelta: 0, semantic: "DOMAIN_RECLASSIFICATION" }), /TWO_COMPONENT/);
});

test("componentized state enforces legacy plus three-component invariant", () => {
  const state = resolveLifetimeXpState({ lifetimeXpSchemaVersion: LIFETIME_XP_SCHEMA_VERSION,
    lifetimeLegacyXp: 25, lifetimeCombatXp: 100, lifetimeStrengthXp: 10,
    lifetimeHonorXp: 5, lifetimeXp: 140 });
  assert.equal(state.combined, 140);
  assert.equal(assertLifetimeInvariant(state), true);
  assert.throws(() => resolveLifetimeXpState({
    lifetimeXpSchemaVersion: LIFETIME_XP_SCHEMA_VERSION,
    lifetimeLegacyXp: 25,
    lifetimeCombatXp: 100,
    lifetimeStrengthXp: 10,
    lifetimeHonorXp: 5,
    lifetimeXp: 139,
  }), /LIFETIME_XP_INVARIANT_VIOLATION/);
});
