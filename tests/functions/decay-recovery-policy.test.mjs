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

test("one verified return practice clears active decay without granting that practice Combat XP", () => {
  const result = resolveQualifyingRecoveryPractice({
    decay: { state: "DECAY_ACTIVE", recoveryDaysCompleted: 0, recoveryLog: [] },
    practiceKey: "practice-1", qualifies: true,
  });
  assert.equal(RECOVERY_DAYS_REQUIRED, 1);
  assert.equal(result.completedAfter, 1);
  assert.equal(result.clearsRecoveryLock, true);
  assert.equal(result.suppressCombatXp, true);
  assert.equal(shouldSuppressCombatAwardForRecovery({
    decay: { state: "CLEAR", recoveryCompletedAttendanceSessionId: "practice-1" },
    awardKind: "ATTENDANCE", attendanceSessionId: "practice-1",
  }), true);
});

test("next verified practice may earn normally after recovery", () => {
  assert.equal(shouldSuppressCombatAwardForRecovery({
    decay: { state: "CLEAR", recoveryCompletedAttendanceSessionId: "practice-1" },
    awardKind: "ATTENDANCE", attendanceSessionId: "practice-2",
  }), false);
});

test("one verified return practice also clears decay freeze", () => {
  const result = resolveQualifyingRecoveryPractice({
    decay: { state: "FROZEN", recoveryDaysCompleted: 0, recoveryLog: [] },
    practiceKey: "frozen-return", qualifies: true,
  });
  assert.equal(result.clearsRecoveryLock, true);
  assert.equal(result.suppressCombatXp, true);
  assert.equal(shouldSuppressCombatAwardForRecovery({
    decay: { state: "FROZEN" }, awardKind: "ATTENDANCE",
  }), true);
});

test("duplicate or non-qualifying practice does not advance recovery", () => {
  const duplicate = resolveQualifyingRecoveryPractice({
    decay: { state: "DECAY_ACTIVE", recoveryDaysCompleted: 0, recoveryLog: ["practice-1"] },
    practiceKey: "practice-1", qualifies: true,
  });
  assert.equal(duplicate.counts, false);
  const unqualified = resolveQualifyingRecoveryPractice({
    decay: { state: "DECAY_ACTIVE", recoveryDaysCompleted: 0, recoveryLog: [] },
    practiceKey: "unqualified", qualifies: false,
  });
  assert.equal(unqualified.counts, false);
});

test("authoritative XP independently enforces recovery lock while Strength and Honor remain permitted", () => {
  const serviceSource = fs.readFileSync(
    new URL("../../functions/src/services/authoritativeXpService.ts", import.meta.url), "utf8"
  );
  assert.match(serviceSource, /shouldSuppressCombatAwardForRecovery\s*\(/);
  assert.match(serviceSource, /DECAY_RECOVERY_PRACTICE_NO_XP/);
  const receiptGuard = serviceSource.indexOf("if (receiptSnap.exists)");
  const recoveryGuard = serviceSource.indexOf("if (shouldSuppressCombatAwardForRecovery", receiptGuard);
  assert.ok(receiptGuard >= 0);
  assert.ok(recoveryGuard > receiptGuard);
  for (const state of ["DECAY_ACTIVE", "FROZEN"]) {
    assert.equal(shouldSuppressCombatAwardForRecovery({decay: {state}, awardKind: "ATTENDANCE"}), true);
    assert.equal(shouldSuppressCombatAwardForRecovery({decay: {state}, awardKind: "ARENA/WEEKEND_BATTLE"}), true);
    assert.equal(shouldSuppressCombatAwardForRecovery({decay: {state}, awardKind: "STRENGTH"}), false);
    assert.equal(shouldSuppressCombatAwardForRecovery({decay: {state}, awardKind: "HONOR"}), false);
  }
});

test("recovery does not reimburse XP or erase points/hits", () => {
  const schedulerSource = fs.readFileSync(
    new URL("../../functions/src/modules/decay/scheduledDecaySweep.ts", import.meta.url), "utf8"
  );
  const practiceSource = fs.readFileSync(
    new URL("../../functions/src/practice/practiceSessions.ts", import.meta.url), "utf8"
  );
  assert.doesNotMatch(schedulerSource, /"decay\.(points|hits)":\s*0/);
  assert.doesNotMatch(practiceSource, /athletePatch\["decay\.(points|hits)"\]/);
  assert.match(practiceSource, /historical decay retained/);
  assert.match(practiceSource, /recoveryCompletedAttendanceSessionId/);
});

test("attendance finalization unfreezes only decay-frozen tier status and scheduler checks recovery before skipping frozen", () => {
  const schedulerSource = fs.readFileSync(
    new URL("../../functions/src/modules/decay/scheduledDecaySweep.ts", import.meta.url), "utf8"
  );
  const practiceSource = fs.readFileSync(
    new URL("../../functions/src/practice/practiceSessions.ts", import.meta.url), "utf8"
  );
  assert.match(schedulerSource, /hasCanonicalRecoveryEvidence\(decay\)/);
  assert.match(schedulerSource, /currentState === "FROZEN"/);
  assert.ok(schedulerSource.indexOf("hasCanonicalRecoveryEvidence(decay)") < schedulerSource.indexOf('action: "SKIPPED_FROZEN"'));
  assert.match(practiceSource, /athletePatch\["tierStatus"\] = "active"/);
});

test("recovery evidence requires a distinct verified practice key", () => {
  assert.equal(normalizeRecoveryProgress(0), 0);
  assert.equal(normalizeRecoveryProgress(1), 1);
  assert.equal(normalizeRecoveryProgress(3), 1);
  assert.equal(hasCanonicalRecoveryEvidence({recoveryDaysCompleted:1,recoveryLog:[]}), false);
  assert.equal(hasCanonicalRecoveryEvidence({recoveryDaysCompleted:1,recoveryLog:["practice-1"]}), true);
});

test("browser and server recovery counters agree", () => {
  for (const state of ["DECAY_ACTIVE", "FROZEN"]) {
    const input={decay:{state,recoveryDaysCompleted:0,recoveryLog:[]},practiceKey:"practice-1",qualifies:true};
    const server=resolveQualifyingRecoveryPractice(input);
    const browser=resolveBrowserRecoveryPractice(input);
    for(const key of ["counts","duplicate","completedBefore","completedAfter","recoveryDaysRequired","clearsRecoveryLock"])
      assert.equal(browser[key],server[key]);
    assert.deepEqual(browser.recoveryLogAfter,server.recoveryLogAfter);
  }
});
