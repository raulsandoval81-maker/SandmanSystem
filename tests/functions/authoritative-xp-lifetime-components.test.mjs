import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildAwardPlan,
  buildLifetimeAwardUpdate,
  normalizeXpRequest,
} from "../../functions/lib/services/authoritativeXpService.js";

const serviceSource = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");

function athlete(base, overrides = {}) {
  const tier = overrides.progressionTier ?? overrides.tier ?? "T1";
  return {
    uid: `${base}_LIFETIME_COMPONENTS`,
    trackBase: base,
    tier,
    ...(base === "F8" ? { progressionTier: tier } : {}),
    xp: 100,
    xpCap: 1600,
    lifetimeXp: 500,
    ...overrides,
  };
}

function request(uid, kind, amount) {
  return normalizeXpRequest({ uid, kind, amount, meta: {} });
}

function lifetimeUpdate(base, kind, amount, overrides = {}) {
  const record = athlete(base, overrides);
  const plan = buildAwardPlan({
    athlete: record,
    athleteId: record.uid,
    request: request(record.uid, kind, amount),
    monthly: {},
  });
  return { record, plan, ...buildLifetimeAwardUpdate(record, plan) };
}

for (const base of ["F4", "F8"]) {
  for (const [kind, amount, domain, field] of [
    ["ATTENDANCE", 10, "COMBAT", "lifetimeCombatXp"],
    ["STRENGTH", 10, "STRENGTH", "lifetimeStrengthXp"],
    ["HONOR", 5, "HONOR", "lifetimeHonorXp"],
  ]) {
    test(`${base} ${domain} updates exactly its lifetime component`, () => {
      const result = lifetimeUpdate(base, kind, amount);
      assert.equal(result.effects.domain, domain);
      assert.equal(result.effects.componentField, field);
      assert.equal(result.effects.lifetimeComponentDelta, amount);
      assert.equal(result.patch[field], amount);
      assert.equal(result.patch.lifetimeLegacyXp, 500);
      assert.equal(result.patch.lifetimeXp, 500 + amount);
      for (const other of ["lifetimeCombatXp", "lifetimeStrengthXp", "lifetimeHonorXp"]) {
        if (other !== field) assert.equal(Object.hasOwn(result.patch, other), false);
      }
      if (base === "F4" && kind !== "ATTENDANCE") {
        assert.equal(result.plan.afterXp, result.plan.beforeXp);
      }
      if (base === "F8") {
        assert.equal(result.plan.afterXp - result.plan.beforeXp, amount);
      }
    });
  }
}

test("Combat lifetime uses the actual cap-clipped award delta", () => {
  const result = lifetimeUpdate("F4", "ATTENDANCE", 10, {
    tier: "T0", xp: 995, xpCap: 1000,
  });
  assert.equal(result.plan.delta, 5);
  assert.equal(result.effects.lifetimeComponentDelta, 5);
  assert.equal(result.patch.lifetimeCombatXp, 5);
  assert.equal(result.patch.lifetimeXp, 505);
});

test("legacy athlete initializes missing components without inferring the legacy domain", () => {
  const result = lifetimeUpdate("F4", "HONOR", 5, { lifetimeXp: 725 });
  assert.deepEqual(result.patch, {
    lifetimeHonorXp: 5,
    lifetimeLegacyXp: 725,
    lifetimeXp: 730,
    lifetimeXpSchemaVersion: "domain-components-v1",
    lifetimeXpReconciliationStatus: "legacy_unreconciled",
  });
});

test("duplicate receipt returns before component resolution and reports zero lifetime delta", () => {
  assert.ok(serviceSource.indexOf("if (receiptSnap.exists)")
    < serviceSource.indexOf("const lifetimeAward = buildLifetimeAwardUpdate"));
  assert.match(serviceSource, /duplicate: true,[\s\S]{0,180}lifetimeXpDelta: 0/);
});

test("authoritative transaction applies one policy patch and records its domain metadata", () => {
  assert.match(serviceSource, /Object\.assign\(athletePatch, lifetimeAward\.patch\)/);
  assert.match(serviceSource, /lifetimeXpDomain: lifetimeXp\.domain/);
  assert.match(serviceSource, /lifetimeXpComponentField: lifetimeXp\.componentField/);
});
