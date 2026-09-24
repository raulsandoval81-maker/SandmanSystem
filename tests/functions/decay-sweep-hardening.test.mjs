import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const engine = fs.readFileSync(
  new URL("../../functions/src/modules/decay/decayEngine.ts", import.meta.url),
  "utf8"
);
const sweep = fs.readFileSync(
  new URL(
    "../../functions/src/modules/decay/scheduledDecaySweep.ts",
    import.meta.url
  ),
  "utf8"
);
const parentSignals = fs.readFileSync(
  new URL(
    "../../functions/src/modules/parent/createParentSignal.ts",
    import.meta.url
  ),
  "utf8"
);

test("decay hit schedule is exactly days 28, 35, 49, 63, 77, and 91", () => {
  assert.match(
    engine,
    /DECAY_HIT_DAY_OFFSETS\s*=\s*\n?\s*Object\.freeze\(\[28, 35, 49, 63, 77, 91\]/
  );
  assert.match(engine, /DECAY_HIT_DAY_OFFSETS\[completedHits\]/);
});

test("scheduled maintenance evaluates every athlete through calculateDecay", () => {
  assert.match(sweep, /collection\("athletes"\)\.get\(\)/);
  assert.match(sweep, /resolveDecayActivityAnchor\(athlete\)/);
  assert.match(sweep, /action: "SKIPPED_RELAUNCH_REQUIRED"/);
  assert.match(sweep, /calculateDecay\(lastActivityAt, now\)/);
  assert.match(sweep, /calculated\.state === "WARNING"/);
  assert.match(sweep, /"decay\.state": "DECAY_ACTIVE"/);
});

test("F8 deductions use root XP with a zero floor", () => {
  assert.match(sweep, /if \(base === "F8"\)/);
  assert.match(sweep, /Math\.max\(0, beforeXp - deduction\)/);
  assert.match(sweep, /patch: \{ xp: afterXp \}/);
});

test("F4 deductions resolve and mirror only primary authority targets", () => {
  assert.match(sweep, /resolveDisciplineXpAuthority\(athlete, primary\)/);
  assert.match(sweep, /if \(!authority\.isPrimary\)/);
  assert.match(
    sweep,
    /authority\.xpWriteTargets\.map\(\(field\) => \[field, afterXp\]\)/
  );
  assert.doesNotMatch(sweep, /Object\.keys\(athlete\.disciplines/);
});

test("missing or invalid primary discipline fails closed", () => {
  assert.match(sweep, /throw new Error\("PRIMARY_DISCIPLINE_REQUIRED"\)/);
  assert.match(sweep, /action: "SKIPPED_XP_AUTHORITY"/);
});

test("due hits are transactional and deterministically receipted", () => {
  assert.match(sweep, /runTransaction/);
  assert.match(sweep, /tx\.get\(ref\)/);
  assert.match(sweep, /collection\("decayHitReceipts"\)/);
  assert.match(sweep, /"decay-hit",\s*athleteId,\s*String\(dueMillis\)/s);
  assert.match(sweep, /if \(\(await tx\.get\(hitReceiptRef\)\)\.exists\)/);
  assert.match(sweep, /tx\.create\(hitReceiptRef/);
});

test("non-due, recovered, and frozen athletes cannot be hit", () => {
  assert.match(sweep, /action: "SKIPPED_NOT_DUE"/);
  assert.match(sweep, /action: "SKIPPED_RECOVERED"/);
  assert.match(sweep, /action: "SKIPPED_FROZEN"/);
  assert.match(sweep, /hasCanonicalRecoveryEvidence\(decay\)/);
});

test("one transaction updates XP, decay hit state, and next persisted due date", () => {
  assert.match(sweep, /tx\.update\(ref, \{\s*\.\.\.authority\.patch/s);
  assert.match(sweep, /"decay\.points": nextPoints/);
  assert.match(sweep, /"decay\.hits": nextHits/);
  assert.match(sweep, /"decay\.nextHitAt": nextDueAt/);
  assert.match(sweep, /Math\.min\([\s\S]*DK_MAX/);
});

test("warning, hit, and frozen parent signals use deterministic identities", () => {
  assert.match(sweep, /PARENT_SIGNAL_TYPES\.DECAY_WARNING/);
  assert.match(sweep, /PARENT_SIGNAL_TYPES\.DECAY_POINTS/);
  assert.match(sweep, /PARENT_SIGNAL_TYPES\.PROGRAM_FROZEN/);
  assert.match(sweep, /idempotencyKey: signal\.sourceId/);
  assert.match(parentSignals, /parentUid\}\|\$\{idempotencyKey/);
  assert.match(parentSignals, /if \(!snapshot\.exists\)/);
});
