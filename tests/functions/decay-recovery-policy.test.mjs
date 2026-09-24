import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  RECOVERY_DAYS_REQUIRED,
  hasCanonicalRecoveryEvidence,
  normalizeRecoveryProgress,
  resolveQualifyingRecoveryPractice,
  shouldSuppressCombatAwardForRecovery,
} from "../../functions/lib/modules/decay/decayRecoveryPolicy.js";
import {
  resolveQualifyingRecoveryPractice as resolveBrowserRecoveryPractice,
} from "../../public/coaches/attendance/decay-recovery-policy.js";

test("first qualifying practice advances to 1/2 and suppresses Combat XP", () => {
  const result = resolveQualifyingRecoveryPractice({
    decay: { state: "DECAY_ACTIVE", recoveryDaysCompleted: 0, recoveryLog: [] },
    practiceKey: "practice-1",
    qualifies: true,
  });
  assert.equal(RECOVERY_DAYS_REQUIRED, 2);
  assert.equal(result.completedAfter, 1);
  assert.equal(result.clearsRecoveryLock, false);
  assert.equal(result.suppressCombatXp, true);
});

test("second qualifying practice completes 2/2 but that practice still earns no XP", () => {
  const result = resolveQualifyingRecoveryPractice({
    decay: { state: "DECAY_ACTIVE", recoveryDaysCompleted: 1, recoveryLog: ["practice-1"] },
    practiceKey: "practice-2",
    qualifies: true,
  });
  assert.equal(result.completedAfter, 2);
  assert.equal(result.clearsRecoveryLock, true);
  assert.equal(result.suppressCombatXp, true);
  assert.equal(shouldSuppressCombatAwardForRecovery({
    decay: { state: "CLEAR", recoveryCompletedAttendanceSessionId: "session-2" },
    awardKind: "ATTENDANCE",
    attendanceSessionId: "session-2",
  }), true);
});

test("next qualifying practice after recovery earns normally", () => {
  assert.equal(shouldSuppressCombatAwardForRecovery({
    decay: { state: "CLEAR", recoveryCompletedAttendanceSessionId: "session-2" },
    awardKind: "ATTENDANCE",
    attendanceSessionId: "session-3",
  }), false);
});

test("authoritative XP independently enforces the recovery lock", () => {
  const serviceSource = fs.readFileSync(
    new URL("../../functions/src/services/authoritativeXpService.ts", import.meta.url), "utf8"
  );
  assert.match(serviceSource, /shouldSuppressCombatAwardForRecovery\s*\(/);
  assert.match(serviceSource, /DECAY_RECOVERY_PRACTICE_NO_XP/);
  const receiptGuard = serviceSource.indexOf("if (receiptSnap.exists)");
  const recoveryGuard = serviceSource.indexOf("if (shouldSuppressCombatAwardForRecovery", receiptGuard);
  assert.ok(receiptGuard >= 0);
  assert.ok(recoveryGuard > receiptGuard);
  assert.equal(shouldSuppressCombatAwardForRecovery({
    decay: { state: "DECAY_ACTIVE" }, awardKind: "ATTENDANCE",
    attendanceSessionId: "session-1",
  }), true);
  assert.equal(shouldSuppressCombatAwardForRecovery({
    decay: { state: "DECAY_ACTIVE" }, awardKind: "ARENA\/WEEKEND_BATTLE",
  }), true);
  assert.equal(shouldSuppressCombatAwardForRecovery({
    decay: { state: "DECAY_ACTIVE" }, awardKind: "STRENGTH",
  }), false);
});

test("recovery clear does not reimburse XP or erase points and hits", () => {
  const attendanceSource = fs.readFileSync(
    new URL("../../public/coaches/attendance/attendance.js", import.meta.url), "utf8"
  );
  const schedulerSource = fs.readFileSync(
    new URL("../../functions/src/modules/decay/scheduledDecaySweep.ts", import.meta.url), "utf8"
  );
  assert.doesNotMatch(attendanceSource, /updatePayload\["decay\.(points|hits)"\]/);
  assert.doesNotMatch(schedulerSource, /"decay\.(points|hits)":\s*0/);
  assert.doesNotMatch(attendanceSource, /lifetimeXp|FieldValue\.increment/);
});

test("duplicate practice does not advance recovery twice", () => {
  const result = resolveQualifyingRecoveryPractice({
    decay: { state: "DECAY_ACTIVE", recoveryDaysCompleted: 1, recoveryLog: ["practice-1"] },
    practiceKey: "practice-1",
    qualifies: true,
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.counts, false);
  assert.equal(result.completedAfter, 1);
});

test("non-qualifying activity does not advance recovery", () => {
  const result = resolveQualifyingRecoveryPractice({
    decay: { state: "DECAY_ACTIVE", recoveryDaysCompleted: 1, recoveryLog: ["practice-1"] },
    practiceKey: "note-1",
    qualifies: false,
  });
  assert.equal(result.counts, false);
  assert.equal(result.completedAfter, 1);
});

test("cleared athlete is excluded and scheduler rechecks state transactionally", () => {
  assert.equal(shouldSuppressCombatAwardForRecovery({
    decay: { state: "CLEAR" }, awardKind: "ATTENDANCE", attendanceSessionId: "session-3",
  }), false);
  const schedulerSource = fs.readFileSync(
    new URL("../../functions/src/modules/decay/scheduledDecaySweep.ts", import.meta.url), "utf8"
  );
  assert.match(schedulerSource, /collection\("athletes"\)\.get\(\)/);
  assert.match(schedulerSource, /runTransaction/);
  assert.match(schedulerSource, /currentState === "FROZEN"/);
  assert.match(schedulerSource, /hasCanonicalRecoveryEvidence\(decay\)/);
  assert.match(schedulerSource, /action: "SKIPPED_RECOVERED"/);
});

test("F4 and F8 share the same recovery policy", () => {
  for (const track of ["F4", "F8"]) {
    const result = resolveQualifyingRecoveryPractice({
      decay: { state: "DECAY_ACTIVE", recoveryDaysCompleted: 0, recoveryLog: [], track },
      practiceKey: `${track}-practice`, qualifies: true,
    });
    assert.equal(result.completedAfter, 1);
    assert.equal(result.suppressCombatXp, true);
  }
});

test("existing recovery progress translates safely without auto-proving ambiguous completion", () => {
  assert.equal(normalizeRecoveryProgress(0), 0);
  assert.equal(normalizeRecoveryProgress(1), 1);
  assert.equal(normalizeRecoveryProgress(2), 2);
  assert.equal(normalizeRecoveryProgress(3), 2);
  assert.equal(hasCanonicalRecoveryEvidence({ recoveryDaysCompleted: 2, recoveryLog: [] }), false);
  assert.equal(hasCanonicalRecoveryEvidence({
    recoveryDaysCompleted: 3, recoveryLog: ["day-1", "day-2", "day-3"],
  }), true);
});

test("browser and server recovery counters agree", () => {
  const input = {
    decay: { state: "DECAY_ACTIVE", recoveryDaysCompleted: 1, recoveryLog: ["day-1"] },
    practiceKey: "day-2", qualifies: true,
  };
  const server = resolveQualifyingRecoveryPractice(input);
  const browser = resolveBrowserRecoveryPractice(input);
  for (const key of ["counts", "duplicate", "completedBefore", "completedAfter",
    "recoveryDaysRequired", "clearsRecoveryLock"]) {
    assert.equal(browser[key], server[key]);
  }
  assert.deepEqual(browser.recoveryLogAfter, server.recoveryLogAfter);
});
