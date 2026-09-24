import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DECAY_RELAUNCH_ID,
  planDecayRelaunch,
  resolveRelaunchActivityAnchor,
} from "../../scripts/decay/decay-production-relaunch-core.mjs";
import decayEngine from "../../functions/lib/modules/decay/decayEngine.js";

const sweep = fs.readFileSync(new URL("../../functions/src/modules/decay/scheduledDecaySweep.ts", import.meta.url), "utf8");
const policy = fs.readFileSync(new URL("../../functions/src/modules/decay/decayRelaunchPolicy.ts", import.meta.url), "utf8");
const baseline = new Date("2026-09-23T07:00:00.000Z");
const migratedAt = new Date("2026-09-24T00:00:00.000Z");

test("pre-baseline activity resolves to the relaunch baseline", () => {
  const resolved = resolveRelaunchActivityAnchor({
    lastAttendanceAt: new Date("2026-08-01"),
    decay: { decayBaselineAt: baseline },
  });
  assert.equal(resolved.toISOString(), baseline.toISOString());
  assert.match(policy, /activity && activity > baseline \? activity : baseline/);
  assert.match(sweep, /resolveDecayActivityAnchor\(athlete\)/);
});

test("post-baseline activity remains authoritative", () => {
  const attendance = new Date("2026-09-30T12:00:00.000Z");
  const resolved = resolveRelaunchActivityAnchor({
    lastAttendanceAt: attendance,
    decay: { decayBaselineAt: baseline },
  });
  assert.equal(resolved.toISOString(), attendance.toISOString());
  assert.match(policy, /athlete\?\.lastAttendanceAt \|\| athlete\?\.lastCombatActivityAt/);
  assert.match(policy, /activity && activity > baseline/);
});

test("scheduler refuses to enforce decay before migration", () => {
  assert.match(sweep, /action: "SKIPPED_RELAUNCH_REQUIRED"/);
});

test("migration preserves history and resets only operational decay", () => {
  const athlete = {
    xp: 725,
    lifetimeXp: 1234,
    tierStatus: "active",
    decay: { state: "DECAY_ACTIVE", hits: 2, points: 50, startedAt: "2026-07-01", recoveryDaysCompleted: 1 },
  };
  const plan = planDecayRelaunch("F4_TEST", athlete, { baseline, migratedAt });
  assert.equal(plan.status, "WOULD_MIGRATE");
  assert.deepEqual(plan.patch.decay.history.productionDecayRelaunch2026.previous, athlete.decay);
  assert.equal(plan.patch.decay.state, "CLEAR");
  assert.equal(plan.patch.decay.hits, 0);
  assert.equal(plan.patch.decay.points, 0);
  assert.equal(plan.patch.decay.startedAt, null);
  assert.equal(plan.patch.decay.lastHitAt, null);
  assert.equal(plan.patch.decay.nextHitAt, null);
  assert.equal(plan.patch.decay.recoveryProgress, 0);
  assert.equal(Object.hasOwn(plan.patch, "xp"), false);
  assert.equal(Object.hasOwn(plan.patch, "lifetimeXp"), false);
});

test("migration rerun is an idempotent no-op", () => {
  const first = planDecayRelaunch("F4_TEST", { decay: { state: "CLEAR" } }, { baseline, migratedAt });
  const migrated = { ...first.patch, decay: first.patch.decay };
  const second = planDecayRelaunch("F4_TEST", migrated, { baseline, migratedAt: new Date("2026-10-01") });
  assert.equal(first.patch.decay.relaunchMigrationId, DECAY_RELAUNCH_ID);
  assert.equal(second.status, "ALREADY_MIGRATED");
  assert.equal(second.patch, null);
});

test("post-relaunch activity cannot be reset by rerunning migration", () => {
  const first = planDecayRelaunch("F4_TEST", { decay: {} }, { baseline, migratedAt });
  const athlete = { ...first.patch, lastAttendanceAt: new Date("2026-09-30"), decay: { ...first.patch.decay, state: "WARNING" } };
  assert.equal(planDecayRelaunch("F4_TEST", athlete, { baseline, migratedAt: new Date("2026-10-02") }).status, "ALREADY_MIGRATED");
});

test("malformed decay documents fail closed", () => {
  assert.equal(planDecayRelaunch("F4_TEST", { decay: "bad" }, { baseline, migratedAt }).status, "ERROR");
  assert.equal(planDecayRelaunch("F4_TEST", { decay: { hits: -1 } }, { baseline, migratedAt }).status, "ERROR");
});

test("athlete stays clear before baseline plus 14 days", () => {
  assert.equal(decayEngine.calculateDecay(baseline, new Date("2026-10-06T06:59:59.999Z")).state, "CLEAR");
});

test("athlete becomes warning at baseline plus 14 days", () => {
  assert.equal(decayEngine.calculateDecay(baseline, new Date("2026-10-07T07:00:00.000Z")).state, "WARNING");
});

test("first deduction is not due before baseline plus 28 days", () => {
  assert.equal(decayEngine.calculateDecay(baseline, new Date("2026-10-21T06:59:59.999Z")).decayHits, 0);
  assert.equal(decayEngine.calculateDecay(baseline, new Date("2026-10-21T07:00:00.000Z")).decayHits, 1);
});

test("lifecycle retains the complete approved hit schedule", () => {
  const engine = fs.readFileSync(new URL("../../functions/src/modules/decay/decayEngine.ts", import.meta.url), "utf8");
  assert.match(engine, /const WARNING_DAYS = 14/);
  assert.match(engine, /Object\.freeze\(\[28, 35, 49, 63, 77, 91\]/);
});
