import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const moduleUrl = new URL("../../functions/lib/management/managementXpTools.js", import.meta.url);
const compiled = readFileSync(moduleUrl, "utf8");
const require = createRequire(moduleUrl);
const { classifyAthlete } = require("../services/authoritativeXpService");

function fixture({ xp = 100, stripeCount = 0, staffRole = "admin", authenticated = true } = {}) {
  const athleteId = "F8_0023";
  const athlete = {
    uid: athleteId,
    primaryDiscipline: "wrestling",
    locationId: "fictional-location",
    xp,
    lifetimeXp: 100,
    legacy: true,
    legacyCreditTotal: 100,
    legacyCreditIssued: 100,
    legacyNote: "Fictional existing recognition",
    disciplines: {
      wrestling: {
        xp: 0,
        stripeCount,
        framework: "foundry8",
        ladderKey: "F8",
        journey: "zero2hero",
        tier: "T0",
        rankName: "Shadow",
      },
      boxing: { xp: 35, uid: athleteId },
      mma: { xp: 15, framework: "foundry4", ladderKey: "Q2M", journey: "quest2mastery" },
    },
  };
  const records = new Map([[`athletes/${athleteId}`, athlete]]);
  const writes = [];
  let nextId = 0;
  const doc = (path) => ({ path, id: path.split("/").at(-1) });
  const db = {
    doc,
    collection: (name) => ({ doc: (id = `log-${++nextId}`) => doc(`${name}/${id}`) }),
    async runTransaction(handler) {
      const pending = [];
      const result = await handler({
        get: async ({ path }) => ({ exists: records.has(path), data: () => records.get(path) }),
        update: (ref, value) => pending.push(["update", ref, value]),
        set: (ref, value) => pending.push(["set", ref, value]),
        create: (ref, value) => pending.push(["create", ref, value]),
      });
      for (const [operation, ref, value] of pending) {
        if (operation === "update") {
          for (const [field, entry] of Object.entries(value)) {
            const segments = field.split(".");
            const leaf = segments.pop();
            const parent = segments.reduce((object, key) => object[key] ??= {}, records.get(ref.path));
            parent[leaf] = entry;
          }
        } else {
          if (operation === "create") assert.equal(records.has(ref.path), false);
          records.set(ref.path, value);
        }
        writes.push([operation, ref.path]);
      }
      return result;
    },
  };
  const realFirestore = require("firebase-admin/firestore");
  const stubs = {
    "firebase-admin/firestore": { ...realFirestore, getFirestore: () => db },
    "firebase-functions/v2/https": { ...require("firebase-functions/v2/https"), onCall: (handler) => handler },
    "../services/staffAuthorization": {
      normalizeStaffRole: (role) => role,
      requireActiveStaff: async (_uid, allowed) => {
        if (!allowed.includes(staffRole)) throw new Error("Management access required");
        return { staff: { role: staffRole, locationId: "other-location" } };
      },
      MANAGEMENT_STAFF_ROLES: Object.freeze(["admin", "management"]),
    },
  };
  const exports = {};
  runInNewContext(compiled, { exports, require: (name) => stubs[name] ?? require(name) });
  const adjust = (data = {}) => exports.createManagementXpAdjustment({
    auth: authenticated ? { uid: "fictional-manager" } : undefined,
    data: {
      athleteUid: athleteId,
      discipline: "wrestling",
      amount: 110,
      adjustmentId: "fictional-paper-entry",
      category: "paper_reconciliation",
      reason: "Fictional paper record",
      ...data,
    },
  });
  return { athlete, adjust, writes };
}

test("canonical framework, ladder, and journey markers resolve explicitly", () => {
  for (const [base, framework, ladderKey, journey] of [
    ["F8", "foundry8", "F8", "zero2hero"],
    ["F4", "foundry4", "F4", "path2legend"],
    ["ADULT", "adult", "Q2M", "quest2mastery"],
  ]) {
    for (const markers of [{ framework }, { ladderKey }, { journey }, { framework, ladderKey, journey }]) {
      assert.equal(classifyAthlete(markers), base);
    }
  }
  assert.equal(classifyAthlete({ framework: "foundry4", ladderKey: "Q2M", journey: "quest2mastery" }), "ADULT");
  assert.equal(classifyAthlete({ trackCode: "foundry4-combat" }), "F4");
  assert.equal(classifyAthlete({ programTrack: "road2champion-wrestling" }), "F8");
});

test("conflicting and unknown explicit markers fail closed", () => {
  assert.throws(() => classifyAthlete({ framework: "foundry8", ladderKey: "F4" }), /AMBIGUOUS_ATHLETE_PROGRAM/);
  assert.throws(() => classifyAthlete({ framework: "foundry4", ladderKey: "F4", journey: "quest2mastery" }), /AMBIGUOUS_ATHLETE_PROGRAM/);
  for (const field of ["framework", "ladderKey", "journey"]) {
    assert.throws(() => classifyAthlete({ [field]: "notfoundry8", trackBase: "F8" }), /UNCLASSIFIED_ATHLETE_PROGRAM/);
  }
  assert.throws(() => classifyAthlete({ trackCode: "notfoundry8" }), /UNCLASSIFIED_ATHLETE_PROGRAM/);
});

test("paper XP mirrors primary Foundry8 rank XP and awards lifetime XP only once across retries", async () => {
  const { athlete, adjust, writes } = fixture();
  const first = await adjust();
  assert.equal(first.base, "F8");
  assert.equal(first.beforeXp, 100);
  assert.equal(first.afterXp, 210);
  assert.equal(first.xpCap, 800);
  assert.equal(first.lifetimeXpDelta, 110);
  assert.equal(athlete.xp, 210);
  assert.equal(athlete.disciplines.wrestling.xp, 210);
  assert.equal(athlete.disciplines.boxing.xp, 35);
  assert.equal(athlete.lifetimeCombatXp, 110);
  assert.equal(athlete.lifetimeXp, 210);
  assert.equal(athlete.lifetimeLegacyXp, 100);
  assert.equal(athlete.legacyCreditTotal, 100);
  assert.equal(athlete.legacyCreditIssued, 100);
  assert.equal(athlete.legacyNote, "Fictional existing recognition");

  const writeCount = writes.length;
  const retry = await adjust();
  assert.equal(retry.idempotent, true);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.logId, first.logId);
  assert.equal(writes.length, writeCount);
  assert.equal(writes.filter(([operation]) => operation === "create").length, 1);
  assert.equal(athlete.lifetimeXp, 210);

  await assert.rejects(adjust({
    category: "verified_experience_override",
    adjustmentId: "fictional-recognition",
    verifiedExperienceYears: 1,
    recognitionPerStage: 100,
  }), /VERIFIED_EXPERIENCE_OVERRIDE_ALREADY_USED/);
  assert.equal(writes.length, writeCount);
});

test("Foundry8 paper adjustment clips the rank and lifetime delta to the 800 XP cap", async () => {
  const { athlete, adjust } = fixture({ xp: 750 });
  const result = await adjust();
  assert.equal(result.afterXp, 800);
  assert.equal(result.delta, 50);
  assert.equal(athlete.disciplines.wrestling.xp, 800);
  assert.equal(athlete.lifetimeCombatXp, 50);
  assert.equal(athlete.lifetimeXp, 150);
});

test("secondary progression requires its own markers and remains isolated from primary XP", async () => {
  const { athlete, adjust, writes } = fixture();
  await assert.rejects(adjust({ discipline: "boxing" }), /UNCLASSIFIED_ATHLETE_PROGRAM/);
  assert.equal(writes.length, 0);

  const result = await adjust({ discipline: "mma" });
  assert.equal(result.base, "ADULT");
  assert.equal(athlete.disciplines.mma.xp, 125);
  assert.equal(athlete.xp, 100);
  assert.equal(athlete.disciplines.wrestling.xp, 0);
});

test("missing nested rank evidence still requires review before any write", async () => {
  const { athlete, adjust, writes } = fixture();
  delete athlete.disciplines.wrestling.rankName;
  await assert.rejects(adjust(), /F8_PROGRESSION_TIER_REVIEW_REQUIRED/);
  assert.equal(writes.length, 0);
});

test("fictional +60 paper XP preserves wrestling authority, legacy credit and receipt identity", async () => {
  const { athlete, adjust, writes } = fixture();
  const secondaryBefore = structuredClone({
    boxing: athlete.disciplines.boxing,
    mma: athlete.disciplines.mma,
  });
  const request = { amount: 60, adjustmentId: "fictional-paper-plus-60" };
  const first = await adjust(request);

  assert.equal(first.base, "F8");
  assert.equal(first.discipline, "wrestling");
  assert.equal(first.xpAuthoritySource, "xp");
  assert.equal(first.primaryXpMirrored, true);
  assert.equal(first.xpCap, 800);
  assert.equal(first.delta, 60);
  assert.equal(first.lifetimeXpDelta, 60);
  assert.equal(athlete.xp, 160);
  assert.equal(athlete.disciplines.wrestling.xp, 160);
  assert.equal(athlete.lifetimeCombatXp, 60);
  assert.equal(athlete.lifetimeXp, 160);
  assert.equal(athlete.lifetimeLegacyXp, 100);
  assert.equal(athlete.legacy, true);
  assert.equal(athlete.legacyCreditTotal, 100);
  assert.equal(athlete.legacyCreditIssued, 100);
  assert.equal(athlete.legacyNote, "Fictional existing recognition");
  assert.deepEqual({
    boxing: athlete.disciplines.boxing,
    mma: athlete.disciplines.mma,
  }, secondaryBefore);

  const writeCount = writes.length;
  const storedAthlete = JSON.stringify(athlete);
  const retry = await adjust(request);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.logId, first.logId);
  assert.equal(writes.length, writeCount);
  assert.equal(writes.filter(([operation]) => operation === "create").length, 1);
  assert.equal(JSON.stringify(athlete), storedAthlete);
});

test("explicit correction classification distinguishes restoration from new earnings", async () => {
  for (const [semantic, lifetimeDelta] of [
    ["RESTORE_ALREADY_COUNTED_XP", 0],
    ["NEW_EARNED_XP", 60],
  ]) {
    const { athlete, adjust, writes } = fixture({ stripeCount: 2 });
    const request = { category: "correction", amount: 60, semantic };
    const result = await adjust(request);
    assert.equal(result.lifetimeXpDelta, lifetimeDelta);
    assert.equal(athlete.lifetimeXp, 100 + lifetimeDelta);
    assert.equal(athlete.xp, 160);
    assert.equal(athlete.disciplines.wrestling.xp, 160);
    assert.equal(athlete.disciplines.wrestling.stripeCount, 2);
    assert.equal(athlete.disciplines.boxing.xp, 35);
    assert.equal(result.earnedStripe, false);
    assert.equal(writes.length, 4);
    assert.equal((await adjust(request)).idempotent, true);
    assert.equal(writes.length, 4);
  }
});

test("invalid semantics, deductions, unsafe integers and cap exhaustion make no writes", async () => {
  const { adjust, writes } = fixture({ xp: 800 });
  for (const [request, error] of [
    [{ category: "correction" }, /MANAGEMENT_CORRECTION_SEMANTIC_REQUIRED/],
    [{ category: "correction", semantic: "REVERSE_ERRONEOUS_AWARD" }, /MANAGEMENT_CORRECTION_SEMANTIC_REQUIRED/],
    [{ semantic: "RESTORE_ALREADY_COUNTED_XP" }, /UNSUPPORTED_MANAGEMENT_SEMANTIC/],
    [{ amount: -1 }, /positive whole number/],
    [{ amount: Number.MAX_SAFE_INTEGER + 1 }, /positive whole number/],
    [{}, /XP_CAP_REACHED/],
  ]) await assert.rejects(adjust(request), error);
  assert.equal(writes.length, 0);
});

test("existing downtime recovery can restore counted XP without adding lifetime XP", async () => {
  const { athlete, adjust } = fixture();
  const result = await adjust({ category: "downtime_recovery", semantic: "RESTORE_ALREADY_COUNTED_XP" });
  assert.equal(result.lifetimeXpDelta, 0);
  assert.equal(athlete.xp, 210);
  assert.equal(athlete.lifetimeXp, 100);
});

test("unauthenticated, coach and cross-location requests cannot write", async () => {
  for (const [options, error] of [
    [{ authenticated: false }, /unauthenticated|sign.in|required/i],
    [{ staffRole: "coach" }, /Management access required/],
    [{ staffRole: "management" }, /outside your assigned location/],
  ]) {
    const { adjust, writes } = fixture(options);
    await assert.rejects(adjust(), error);
    assert.equal(writes.length, 0);
  }
});
