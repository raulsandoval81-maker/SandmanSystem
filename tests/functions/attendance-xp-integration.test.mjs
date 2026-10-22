import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("full-practice save moves into verified attendance and integrated XP", async () => {
  const [log, attendanceHtml, attendanceJs] = await Promise.all([
    read("public/coaches/logs/practice-log.js"),
    read("public/coaches/attendance/index.html"),
    read("public/coaches/attendance/attendance.js"),
  ]);
  assert.ok(log.includes("/coaches/attendance/?session=${encodeURIComponent(practiceId)}"));
  assert.match(attendanceHtml, /id="practiceXpPanel" hidden/);
  assert.match(attendanceHtml, /id="issuePracticeXp"/);
  assert.match(attendanceJs, /if \(finalized\) \{\s*showPracticeXp\(practiceId\)/);
  assert.match(attendanceJs, /await finalizeAttendance\(\{ practiceId: pendingSessionId, presentIds, notes \}\)/);
  assert.match(attendanceJs, /await loadPracticeReview\(finalizedSessionId\)/);
  assert.match(attendanceJs, /Attendance finalize failed: /);
});

test("XP is issued only after finalized attendance with canonical session identity", async () => {
  const js = await read("public/coaches/attendance/attendance.js");
  const service = await read("functions/src/services/authoritativeXpService.ts");
  assert.match(js, /pendingSession\?\.finalized !== true/);
  assert.match(js, /attendanceSessionId: pendingSessionId, sessionId: pendingSessionId/);
  assert.match(js, /uid: athleteId, kind: "DAILY_GRIND"/);
  assert.match(js, /creditedAthletes\.add\(athleteId\)/);
  assert.match(js, /if \(failures\.length\)/);
  assert.match(js, /completePracticeDailyGrind/);
  assert.match(js, /closePracticeSession/);
  assert.match(service, /ATTENDANCE_SESSION_NOT_FINALIZED/);
  assert.match(service, /ATHLETE_NOT_PRESENT_IN_ATTENDANCE_SESSION/);
  assert.match(service, /tx\.create\(receiptRef/);
});

test("standalone Coach XP Tool preserves original Daily Grind without Session Builder", async () => {
  const [today, daily] = await Promise.all([
    read("public/coaches/today/index.html"),
    read("public/coaches/daily-xp/daily-grind.js"),
  ]);
  assert.match(today, /Coach XP Tool/);
  assert.match(today, /href="\/coaches\/daily-xp\/"/);
  assert.match(daily, /COACH_VERIFIED_PRACTICE_SOURCE/);
  assert.match(daily, /requestCoachVerifiedPracticeEvidence/);
});

test("finalize control follows the roster and opens the XP step", async () => {
  const [html, js, css] = await Promise.all([
    read("public/coaches/attendance/index.html"),
    read("public/coaches/attendance/attendance.js"),
    read("public/coaches/attendance/attendance.css"),
  ]);
  const roster = html.indexOf('id="athleteList"');
  const button = html.indexOf('id="saveAttendance"');
  const xp = html.indexOf('id="practiceXpPanel"');
  assert.ok(roster >= 0 && button > roster && xp > button);
  assert.match(html, /Finalize Attendance &amp; Continue to XP/);
  assert.match(js, /await loadPracticeReview\(finalizedSessionId\);[\s\S]*revealPracticeXp\(\)/);
  assert.match(js, /scrollIntoView/);
  assert.match(js, /finalizeButton\.hidden = finalized/);
  assert.match(css, /#practiceXpPanel\[hidden\]/);
});

test("one verified participant roster becomes the XP card surface after finalization", async () => {
  const [html, js, css] = await Promise.all([
    read("public/coaches/attendance/index.html"),
    read("public/coaches/attendance/attendance.js"),
    read("public/coaches/attendance/attendance.css"),
  ]);
  assert.match(html, /id="athleteList"/);
  assert.doesNotMatch(html, /id="practiceXpRows"/);
  assert.match(html, /id="practiceXpPanel" hidden/);
  assert.match(js, /\/\/ Render the very same cards in XP mode; never clone the athlete roster\./);
  assert.match(js, /renderAthletes\(\);/);
  assert.match(js, /practice-xp-amount/);
  assert.match(js, /aria-pressed/);
  assert.match(js, /creditedAthletes\.has\(id\)/);
  assert.match(css, /\.xp-choice--5/);
  assert.match(css, /\.xp-choice--10/);
  assert.match(css, /\.xp-choice--15/);
  assert.match(css, /\.xp-choice--20/);
});

test("XP options are fail-closed on missing duration and T0 limits", async () => {
  const [js, backend] = await Promise.all([
    read("public/coaches/attendance/attendance.js"),
    read("functions/src/services/authoritativeXpService.ts"),
  ]);
  assert.match(js, /!Number\.isFinite\(practiceDurationMinutes\) \|\| practiceDurationMinutes <= 0/);
  assert.match(js, /if \(youth\) return \[5, 10\]/);
  assert.match(js, /const apprentice = tier === "T0" \|\| tier === "APPRENTICE" \|\| !tier/);
  assert.match(js, /if \(apprentice \|\| practiceDurationMinutes < 90\) return \[5, 10\]/);
  assert.match(js, /if \(practiceDurationMinutes < 120\) return \[5, 10, 15\]/);
  assert.match(js, /return \[5, 10, 15, 20\]/);
  assert.match(js, /!athleteXpOptions\(athlete\)\.includes\(Number\(choice\.value\)\)/);
  assert.match(backend, /APPRENTICE_PRACTICE_XP_CEILING/);
  assert.match(backend, /durationMinutes >= 120 \? 20 : durationMinutes >= 90 \? 15 : 10/);
});
