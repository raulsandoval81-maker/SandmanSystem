import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("canonical practiceId survives Clipboard, Clock, Companion, and Practice Log", async () => {
  const [clipboard, clock, companion, practiceLog] = await Promise.all([
    read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js"),
    read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js"),
    read("public/coaches/execution/coach-companion/coach-companion.js"),
    read("public/coaches/logs/practice-log.js"),
  ]);
  assert.match(clipboard, /practiceId:\s*session\.practiceId/);
  assert.match(clock, /payload\.practiceId\s*\|\|\s*session\.practiceId/);
  assert.match(companion, /practiceId:\s*session\?\.practiceId\s*\|\|\s*""/);
  assert.match(practiceLog, /sessionSource\.practiceId\s*\|\|\s*payload\?\.practiceId/);
});

test("planned and worked memory use separate explicit server operations", async () => {
  const [clipboard, clock, server] = await Promise.all([
    read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js"),
    read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js"),
    read("functions/src/practice/practiceSessions.ts"),
  ]);
  assert.match(clipboard, /operation:\s*"plan"/);
  assert.match(clock, /operation:\s*"worked"/);
  assert.match(clock, /updateDurableWorkedMemory\(\{ block: current/);
  assert.doesNotMatch(clock, /plannedCards.*workedCards/s);
  assert.match(server, /"sessionMemory\.plannedCards"/);
  assert.match(server, /"sessionMemory\.workedCards"/);
});

test("Practice Log keeps local compatibility and never fabricates practice identity", async () => {
  const source = await read("public/coaches/logs/practice-log.js");
  assert.match(source, /localStorage\.setItem\(\s*LOG_KEY/);
  assert.match(source, /if \(practiceId\)/);
  assert.match(source, /Saved locally \(legacy session\)/);
  assert.doesNotMatch(source, /collection\([^)]+practiceSessions/);
});
