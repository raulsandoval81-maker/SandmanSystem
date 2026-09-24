import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync(
  new URL("../../functions/src/services/authoritativeXpService.ts", import.meta.url),
  "utf8"
);
const http = fs.readFileSync(
  new URL("../../functions/src/modules/xpHttp.ts", import.meta.url),
  "utf8"
);
const dailyGrind = fs.readFileSync(
  new URL("../../public/coaches/daily-xp/daily-grind.js", import.meta.url),
  "utf8"
);

test("finalized attendance remains the default trusted path", () => {
  assert.match(service, /attendance_sessions\/\$\{attendanceSessionId\}/);
  assert.match(service, /ATTENDANCE_SESSION_NOT_FINALIZED/);
  assert.match(service, /ATHLETE_NOT_PRESENT_IN_ATTENDANCE_SESSION/);
  assert.match(service, /ATTENDANCE_SESSION_ID_MISMATCH/);
  assert.match(service, /return `attendance:\$\{requiredString\(request\.meta\.attendanceSessionId/);
});

test("coach verified practice has a distinct deterministic receipt identity", () => {
  assert.match(service, /COACH_VERIFIED_PRACTICE_SOURCE = "coach-verified-practice"/);
  assert.match(service, /"coach-practice",\s*requiredString\(request\.meta\.verifiedCoachUid/s);
  assert.match(service, /request\.meta\.sessionDateKey/);
  assert.match(service, /request\.meta\.discipline/);
  assert.match(service, /coachVerifiedPracticeKey\(request\.meta\.practiceKey\)/);
  assert.match(service, /request\.meta\.verifiedCoachUid = requiredString\(coachUid/);
  assert.match(service, /awardReceiptKey\(request\.uid, awardIdentity\)/);
});

test("coach verified evidence is validated without fabricating attendance", () => {
  assert.match(service, /COACH_VERIFIED_PRACTICE_BLOCKED_SUNDAY/);
  assert.match(service, /COACH_VERIFIED_PRACTICE_DATE_IN_FUTURE/);
  assert.match(service, /INVALID_COACH_VERIFIED_PRACTICE_KEY/);
  assert.match(service, /normalizeLifetimeCombatDiscipline/);
  assert.match(service, /delete request\.meta\.attendanceSessionId/);
  assert.match(service, /delete request\.meta\.sessionId/);
  assert.match(service, /request\.meta\.durationMinutes = 60/);
  assert.doesNotMatch(dailyGrind, /coachVerifiedEvidence[^;]*attendanceSessionId/s);
});

test("coach verified practice cannot advance Decay recovery", () => {
  assert.match(service, /delete request\.meta\.attendanceSessionId/);
  assert.match(service, /shouldSuppressCombatAwardForRecovery\(\{[\s\S]*attendanceSessionId: request\.meta\.attendanceSessionId/);
  assert.match(service, /DECAY_RECOVERY_PRACTICE_NO_XP/);
});

test("HTTP bearer auth and Coach Admin authorization remain required", () => {
  assert.match(http, /verifyIdToken\(bearer\)/);
  assert.match(http, /requireActiveStaff\(coachUid, COACH_STAFF_ROLES/);
  assert.match(http, /requireCoachAthleteAccessById\(actor, payload\.uid\)/);
});

test("Daily Grind explicitly confirms fallback evidence once per award batch", () => {
  assert.match(dailyGrind, /Coach-Verified Practice date \(YYYY-MM-DD\)/);
  assert.match(dailyGrind, /Confirm Coach-Verified Practice/);
  assert.match(dailyGrind, /source: COACH_VERIFIED_PRACTICE_SOURCE/);
  assert.match(dailyGrind, /sessionDateKey,\s*discipline,\s*practiceKey/s);
  assert.match(dailyGrind, /activeAttendanceSession\.id[\s\S]*requestCoachVerifiedPracticeEvidence\(\)/);
});
