import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("athlete input is server-authorized and limited to finalized present athletes", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  assert.match(source, /export const savePracticeAthleteInput = onCall/);
  assert.match(source, /Matching finalized attendance is required before athlete input/);
  assert.match(source, /presentIds\.includes\(athleteId\)/);
  assert.match(source, /coachInput:[\s\S]*coachObservation[\s\S]*developmentNote/);
  assert.match(source, /\}, \{ merge: true \}\)/);
});

test("final close requires completed attendance XP for verified participants", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  const close = source.slice(source.indexOf("export const closePracticeSession"));
  assert.match(close, /Matching finalized attendance is required before closing/);
  assert.match(close, /participants\.length > 0/);
  assert.match(close, /attendance\.readyForDailyGrind !== false/);
  assert.match(close, /xpAwardReceipts/);
  assert.match(close, /Daily Grind must be completed for every verified participant/);
  assert.match(close, /liveSessionId \? db\.doc/);
});

test("Practice Log loads canonical state by practiceId and keeps local fallback", async () => {
  const [source, html] = await Promise.all([
    read("public/coaches/logs/practice-log.js"),
    read("public/coaches/logs/practice-log.html"),
  ]);
  assert.match(source, /params\.get\("practiceId"\).*params\.get\("practice"\)/s);
  assert.match(source, /httpsCallable\(functions, "getPracticeAttendanceReview"\)/);
  assert.match(source, /httpsCallable\(functions, "savePracticeAthleteInput"\)/);
  assert.match(source, /httpsCallable\(functions, "closePracticeSession"\)/);
  assert.match(source, /localStorage\.setItem\(\s*LOG_KEY/);
  assert.match(html, /id="athleteInput"/);
  assert.match(html, /id="closeBtn"/);
});

test("history returns athlete observations and canonical practice reflection", async () => {
  const source = await read("functions/src/practice/getAthleteSessionHistory.ts");
  assert.match(source, /coachInput: athleteSession\.coachInput \|\| null/);
  assert.match(source, /practiceReflection: practice\.sessionMemory\?\.reflection \|\| null/);
});
