import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const policyPath = path.join(repo, "public/coaches/execution/session-builder/session-entry-policy.js");
const policy = await import(pathToFileURL(policyPath));

test("rooms carry explicit canonical location identity", () => {
  assert.deepEqual(policy.roomByValue("lompoc-mat-1"), {
    value: "lompoc-mat-1", roomId: "mat-1", locationId: "lompoc", label: "Lompoc Mat 1"
  });
  assert.equal(policy.roomByValue("solvang-mat-1").locationId, "santa-ynez-valley");
});

test("program availability is filtered by canonical location", () => {
  const santaYnez = policy.programsForLocation("santa-ynez-valley").map((item) => item.programId);
  const lompoc = policy.programsForLocation("lompoc").map((item) => item.programId);
  assert.ok(santaYnez.includes("youth-z2h-wrestling"));
  assert.ok(santaYnez.includes("teen-p2l-wrestling"));
  assert.ok(santaYnez.includes("teen-p2l-boxing"));
  assert.ok(santaYnez.includes("fitness-striking"));
  assert.deepEqual(lompoc, ["manual-build"]);
  assert.equal(santaYnez.includes("adult-q2m-mma"), false);
});

test("Road2Champion Muay Thai is canonical, Santa Ynez-only, and Manual-only", () => {
  const program = policy.programById("youth-z2h-muay-thai");
  assert.equal(program.label, "Road2Champion Muay Thai");
  assert.equal(program.discipline, "muay-thai");
  assert.equal(program.journey, "Z2H");
  assert.equal(program.ageBand, "Youth 7–13");
  assert.deepEqual(program.allowedLocationIds, ["santa-ynez-valley"]);
  assert.equal(program.manual, true);
  assert.equal(program.hybrid, false);
  assert.equal(program.hybridModelPrefix, "");
});

test("attendance context deduplicates athletes and summarizes actual ranks", () => {
  const attendance = {
    checkedIn: [
      { id: "F8_1", name: "One", journey: "Z2H", rank: "Shadow" },
      { uid: "F8_1", name: "Duplicate", rank: "Shadow" },
      { id: "F8_2", name: "Two", tier: "Prospect" },
      { id: "F8_3", name: "Three", rank: "Shadow" }
    ]
  };
  assert.equal(policy.attendanceParticipants(attendance).length, 3);
  assert.deepEqual(policy.attendanceRankSummary(attendance), [
    { label: "Shadow", count: 2 },
    { label: "Prospect", count: 1 }
  ]);
});

test("Auto, Hybrid, and Manual are functional guided setup modes", () => {
  assert.ok(policy.SESSION_ENTRY_MODES.includes("auto"));
  assert.ok(policy.SESSION_ENTRY_MODES.includes("hybrid"));
  assert.ok(policy.SESSION_ENTRY_MODES.includes("manual"));
  assert.equal(policy.normalizeExecutionMode("auto"), "auto");
  const html = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/index.html"), "utf8");
  assert.match(html, /data-mode="auto"/);
  assert.match(html, /data-mode="hybrid"/);
  assert.match(html, /data-mode="manual"/);
});

test("Auto, Manual, and Hybrid use the shared Builder and Clipboard spine", () => {
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  const clipboard = fs.readFileSync(path.join(repo, "public/coaches/execution/clipboard-2.0/clipboard-2.0.js"), "utf8");
  assert.match(builder, /data-mode|selectedMode/);
  assert.match(builder, /openPracticeSession/);
  assert.match(builder, /clipboard-2\.0/);
  assert.doesNotMatch(builder, /daily-clipboard/);
  assert.match(clipboard, /window\.runPractice/);
  assert.match(clipboard, /openPracticeSession/);
});


test("Session Builder starts with Pre-Practice Setup or Skip to Practice", () => {
  const html = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/index.html"), "utf8");
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  assert.match(html, /Set Up Pre-Practice/);
  assert.match(html, /Skip to Practice/);
  assert.match(builder, /executionMode:\s*"manual"/);
  assert.match(builder, /discipline:\s*"unassigned"/);
  assert.match(builder, /big-clock-2\.0\/\?practiceId=/);
});


test("fast practice runs from Big Clock and posts practice input afterward", () => {
  const clockHtml = fs.readFileSync(path.join(repo, "public/coaches/execution/big-clock-2.0/index.html"), "utf8");
  const clockJs = fs.readFileSync(path.join(repo, "public/coaches/execution/big-clock-2.0/big-clock-2.0.js"), "utf8");
  const logHtml = fs.readFileSync(path.join(repo, "public/coaches/logs/practice-log.html"), "utf8");
  assert.match(clockHtml, /30 min/);
  assert.match(clockHtml, /45 min/);
  assert.match(clockHtml, /60 min/);
  assert.match(clockHtml, /90 min/);
  assert.match(clockJs, /session-builder-fast-pass/);
  assert.match(clockJs, /Post Practice Input/);
  assert.match(clockJs, /savePracticeSessionMemory/);
  assert.match(logHtml, /Practice Details/);
  assert.match(logHtml, /Save Practice Details/);
});


test("guided setup separates session type, duration, and build mode", () => {
  const html = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/index.html"), "utf8");
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  const clipboard = fs.readFileSync(path.join(repo, "public/coaches/execution/clipboard-2.0/clipboard-2.0.js"), "utf8");

  assert.match(html, /Academy Class/);
  assert.match(html, /Private Session/);
  assert.match(builder, /durations: \[60, 75, 90, 120\]/);
  assert.match(builder, /durations: \[30, 45, 60, 90\]/);
  assert.match(builder, /selectedMode = "hybrid"/);
  assert.match(clipboard, /"private-30"/);
  assert.match(clipboard, /"academy-75"/);
  assert.match(clipboard, /"academy-120"/);
});


test("guided setup opens Screen 3 Practice Route with journey-led discipline dropdowns", () => {
  const html = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/index.html"), "utf8");
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");

  assert.match(html, /id="guidedSetupScreen"/);
  assert.match(html, /id="practiceContextScreen" hidden/);
  assert.match(html, /Continue to Practice Route/);
  assert.match(html, /Screen 3 · Practice Route/);
  assert.match(html, /id="journeySelect"/);
  assert.match(html, /id="disciplineFamilySelect" class="dashboard-select"/);
  assert.doesNotMatch(html, /data-discipline=/);
  assert.doesNotMatch(html, /<label for="roomSelect">Room<\/label>/);
  assert.match(html, /<select id="roomSelect" hidden/);
  assert.match(builder, /function showPracticeContext\(/);
  assert.match(builder, /function populateJourneys\(/);
  assert.match(builder, /function updateDisciplineAvailability\(/);
});


test("Session Builder excludes fitness discipline from guided practice", () => {
  const html = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/index.html"), "utf8");
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  assert.doesNotMatch(html, /data-discipline="striking"/);
  assert.doesNotMatch(html, />Fitness \/ Striking</);
  assert.match(builder, /"fitness-striking"/);
});





test("practice route is Screen 3, attendance is Screen 4, Clipboard is Screen 5", () => {
  const builderHtml = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/index.html"), "utf8");
  const builderJs = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");
  const attendanceHtml = fs.readFileSync(path.join(repo, "public/coaches/attendance/session.html"), "utf8");
  const attendanceJs = fs.readFileSync(path.join(repo, "public/coaches/attendance/session.js"), "utf8");

  assert.match(builderHtml, /Screen 3 · Practice Route/);
  assert.match(builderHtml, /Continue to Attendance/);
  assert.match(builderHtml, /id="journeySelect"/);
  assert.match(builderJs, /populateJourneys/);
  assert.match(builderJs, /return=clipboard&flow=builder/);
  assert.match(attendanceHtml, /Finish Attendance/);
  assert.match(attendanceHtml, /data-quick-search="a">A/);
  assert.match(attendanceHtml, /data-quick-search="e">E/);
  assert.match(attendanceHtml, /data-quick-search="i">I/);
  assert.match(attendanceHtml, /data-quick-search="o">O/);
  assert.match(attendanceHtml, /data-quick-search="u">U/);
  assert.doesNotMatch(attendanceHtml, /Session Builder · Screen 3/);
  assert.doesNotMatch(attendanceJs, /athlete-number/);
  assert.match(attendanceJs, /clipboard-2\.0/);
});


test("focus tier and week follow Auto, Hybrid, and Manual behavior", () => {
  const html = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/index.html"), "utf8");
  const builder = fs.readFileSync(path.join(repo, "public/coaches/execution/session-builder/session-builder.js"), "utf8");

  assert.match(html, /id="rankSuggestion"/);
  assert.match(html, /id="weekSuggestion"/);
  assert.match(builder, /function matchingPriorFocus\(/);
  assert.match(builder, /function refreshFocusSuggestion\(/);
  assert.match(builder, /System choice/);
  assert.match(builder, /Suggested/);
  assert.match(builder, /Coach choice/);
  assert.match(builder, /Sandman chooses/);
  assert.doesNotMatch(builder, /disciplineButtons/);
});
