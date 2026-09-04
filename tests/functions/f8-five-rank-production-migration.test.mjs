import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVED_F8_IDS,
  APPROVED_F8_SNAPSHOT,
  CURRICULUM_VERSION,
  PRODUCTION_CONFIRMATION_TOKEN,
  assertExactApprovedAllowlist,
  buildApprovedPatch,
  executeApprovedMigration,
  preflightApprovedRecords,
  verifyApprovedRecords,
} from "../../scripts/f8-migration/f8-five-rank-production-migration.mjs";

function approvedRecords() {
  return new Map(APPROVED_F8_IDS.map((id) => [id, {
    uid: id,
    trackBase: "F8",
    programTrack: "zero2hero",
    ...APPROVED_F8_SNAPSHOT[id],
    lifetimeXp: 999,
    challengeXp: 77,
  }]));
}

test("the production allowlist is exactly the nine Coach-approved IDs", () => {
  assert.deepEqual(APPROVED_F8_IDS, [
    "F8_0001", "F8_0010", "F8_0011", "F8_0012", "F8_0014",
    "F8_0015", "F8_0017", "F8_0018", "F8_0020",
  ]);
  assert.equal(assertExactApprovedAllowlist(APPROVED_F8_IDS), true);
  assert.throws(() => assertExactApprovedAllowlist([...APPROVED_F8_IDS, "F8_EXTRA"]), /exact approved allowlist/);
});

test("non-allowlisted and F4 records are rejected", () => {
  assert.throws(() => buildApprovedPatch("F8_EXTRA", { trackBase: "F8" }), /not allowlisted/);
  const records = approvedRecords();
  records.get("F8_0001").trackBase = "F4";
  assert.throws(() => preflightApprovedRecords(records), /not positively classified F8/);
});

test("changed-since-snapshot progression state is rejected", () => {
  const records = approvedRecords();
  records.get("F8_0010").xp = 290;
  assert.throws(() => preflightApprovedRecords(records), /no longer matches/);
});

test("XP is preserved and is never included in a migration patch", () => {
  for (const plan of preflightApprovedRecords(approvedRecords())) {
    assert.equal(plan.preservedXp, APPROVED_F8_SNAPSHOT[plan.id].xp);
    assert.equal(Object.hasOwn(plan.patch, "xp"), false);
  }
});

test("Shadow receives the 800 cap and stripes recalculate at 200 and 400", () => {
  const below200 = buildApprovedPatch("F8_0001", approvedRecords().get("F8_0001"));
  const over200 = buildApprovedPatch("F8_0014", approvedRecords().get("F8_0014"));
  const over400 = buildApprovedPatch("F8_0011", approvedRecords().get("F8_0011"));
  assert.equal(below200.patch.xpCap, 800);
  assert.equal(below200.patch.stripeCount, 0);
  assert.equal(over200.patch.stripeCount, 1);
  assert.equal(over400.patch.stripeCount, 2);
});

test("Paul's existing 800 cap is accepted without remapping his 175 XP", () => {
  const plan = buildApprovedPatch("F8_0020", approvedRecords().get("F8_0020"));
  assert.equal(plan.preservedXp, 175);
  assert.equal(plan.patch.xpCap, 800);
  assert.equal(plan.patch.stripeCount, 0);
});

test("Theo's reviewed 435 XP is preserved without issuing credit", () => {
  const plan = buildApprovedPatch("F8_0011", approvedRecords().get("F8_0011"));
  assert.equal(plan.preservedXp, 435);
  assert.equal(Object.hasOwn(plan.patch, "legacyCreditTotal"), false);
  assert.equal(Object.hasOwn(plan.patch, "legacyCreditIssued"), false);
});

test("patches do not mutate Lifetime, Challenge, or historical XP domains", () => {
  const plan = buildApprovedPatch("F8_0011", approvedRecords().get("F8_0011"));
  for (const field of ["lifetimeXp", "challengeXp", "xpLogs", "xp_logs", "monthly", "xpStrength", "xpHonor"])
    assert.equal(Object.hasOwn(plan.patch, field), false);
});

test("curriculum fields are preserved by omission from every migration patch", () => {
  for (const plan of preflightApprovedRecords(approvedRecords())) {
    assert.equal(Object.hasOwn(plan.patch, "curriculumTier"), false);
    assert.equal(Object.hasOwn(plan.patch, "curriculumVersion"), false);
    assert.equal(plan.patch.progressionTier, "T0");
  }
});

test("existing curriculum values survive conceptually because patches cannot overwrite them", () => {
  const records = approvedRecords();
  const athlete = records.get("F8_0014");
  athlete.curriculumTier = "T0";
  athlete.curriculumVersion = CURRICULUM_VERSION;
  const plan = buildApprovedPatch("F8_0014", athlete);
  const conceptualMerge = { ...athlete, ...plan.patch };
  assert.equal(conceptualMerge.curriculumTier, "T0");
  assert.equal(conceptualMerge.curriculumVersion, CURRICULUM_VERSION);
});

test("no explicit opt-in performs zero writes", async () => {
  let commits = 0;
  const result = await executeApprovedMigration({
    records: approvedRecords(),
    commit: async () => { commits += 1; },
  });
  assert.equal(result.mode, "PREFLIGHT");
  assert.equal(result.writes, 0);
  assert.equal(commits, 0);
});

test("write mode rejects a missing or invalid confirmation token", async () => {
  await assert.rejects(() => executeApprovedMigration({ records: approvedRecords(), write: true }), /confirmation token/);
  await assert.rejects(() => executeApprovedMigration({
    records: approvedRecords(), write: true, confirmationToken: "wrong",
  }), /confirmation token/);
});

test("failed all-athlete preflight causes zero writes", async () => {
  const records = approvedRecords();
  records.get("F8_0017").stripeCount = 3;
  let commits = 0;
  await assert.rejects(() => executeApprovedMigration({
    records,
    write: true,
    confirmationToken: PRODUCTION_CONFIRMATION_TOKEN,
    commit: async () => { commits += 1; },
  }), /no longer matches/);
  assert.equal(commits, 0);
});

test("completed records are recognized idempotently", () => {
  const records = approvedRecords();
  for (const [id, athlete] of records) Object.assign(athlete, buildApprovedPatch(id, athlete).after);
  const plans = verifyApprovedRecords(records).plans;
  assert.equal(plans.every((plan) => plan.status === "ALREADY_CORRECT"), true);
});
