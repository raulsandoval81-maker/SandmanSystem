import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  applyExecutionCommand, buildExecutionCommand, controllerSnapshot
} from "../../public/coaches/execution/engine/practice-remote-control.mjs";

const command = (type, extra = {}) => buildExecutionCommand({
  commandId: `cmd-${type}`, practiceId: "practice-1", sessionId: "session-1", planVersion: 3, type, ...extra
});

test("pause and resume use the existing clock baseline without elapsed drift", () => {
  const running = { running: true, paused: false, blockStartedAt: 10_000, blockElapsedSeconds: 20, blockDuration: 120, index: 0 };
  const paused = applyExecutionCommand(running, command("pause"), { now: 15_000 });
  assert.equal(paused.blockElapsedSeconds, 25);
  const resumed = applyExecutionCommand(paused, command("resume"), { now: 30_000 });
  assert.equal(controllerSnapshot(resumed, { sessionId: "session-1", now: 35_000 }).elapsedSeconds, 30);
});

test("skip seeks only the existing parent clock and does not create elapsed time", () => {
  const state = { running: false, paused: true, blockElapsedSeconds: 12, blockDuration: 60, index: 0 };
  const skipped = applyExecutionCommand(state, command("skip"), { phaseEndSeconds: 30 });
  assert.equal(skipped.blockElapsedSeconds, 30);
  assert.equal(skipped.running, false);
});

test("commands support shared drill, group, current timing, and future-block adjustments", () => {
  const base = { running: false, blockElapsedSeconds: 0, blockDuration: 60, index: 0 };
  assert.equal(applyExecutionCommand(base, command("adjust-current-time", { seconds: 75 })).blockDuration, 75);
  assert.equal(applyExecutionCommand(base, command("switch-drill", { drillId: "d2" })).activeDrillId, "d2");
  assert.equal(applyExecutionCommand(base, command("switch-group", { groupId: "g2" })).activeGroupId, "g2");
  assert.deepEqual(applyExecutionCommand(base, command("adjust-future-block", { blockId: "live", seconds: 180 })).remoteFutureAdjustments, { live: 180 });
});

test("unsupported or identity-free remote commands fail closed", () => {
  assert.throws(() => command("award-xp"), /INVALID_EXECUTION_COMMAND/);
  assert.throws(() => buildExecutionCommand({ commandId: "x", practiceId: "", sessionId: "s", planVersion: 1, type: "pause" }), /INVALID_EXECUTION_COMMAND/);
});

test("server command channel preserves ownership, optimistic concurrency, plan references, and separation", () => {
  const source = fs.readFileSync(new URL("../../functions/src/practice/practiceSessions.ts", import.meta.url), "utf8");
  assert.match(source, /requirePracticeOwner\(actor, practice\)/);
  assert.match(source, /expectedVersion !== version/);
  assert.match(source, /Execution command uses a stale practice plan/);
  assert.match(source, /Command drill is outside the approved plan/);
  assert.match(source, /Command group is outside the approved plan/);
  assert.match(source, /sessionMemory\.executionControl/);
  assert.doesNotMatch(source.slice(source.indexOf('operation === "execution-command"'), source.indexOf('operation === "execution-state"')), /awardXp|closePracticeSession|attendance_sessions/);
});

test("Big Clock applies commands and Companion remains optional for Closeout", () => {
  const clock = fs.readFileSync(new URL("../../public/coaches/execution/big-clock-2.0/big-clock-2.0.js", import.meta.url), "utf8");
  const companion = fs.readFileSync(new URL("../../public/coaches/execution/coach-companion/coach-companion.js", import.meta.url), "utf8");
  assert.match(clock, /applyExecutionCommand/);
  assert.match(clock, /control\.command\.type === "start"[\s\S]*startFromPayload\(\)/);
  assert.match(clock, /getRunElapsedSeconds/);
  assert.equal((clock.match(/setInterval\(render, 250\)/g) || []).length, 1);
  assert.match(companion, /saveDailyPracticeLog/);
  assert.match(companion, /Continue to Post-Practice Clipboard|practice-log\.html/);
  assert.doesNotMatch(companion, /awardXp|finalizeXp/);
});

test("rapid commands are rejected until Big Clock acknowledges the pending command", () => {
  const server = fs.readFileSync(new URL("../../functions/src/practice/practiceSessions.ts", import.meta.url), "utf8");
  const issue = server.slice(server.indexOf('if (operation === "execution-command")'), server.indexOf('if (operation === "execution-state")'));
  assert.match(issue, /control\.appliedVersion\s*\|\|\s*0/);
  assert.match(issue, /< version[\s\S]*Previous execution command is awaiting Big Clock acknowledgment/);
  assert.match(issue, /expectedVersion !== version/);
  for (const [first, second] of [["pause", "resume"], ["skip", "advance"], ["start", "pause"]]) {
    assert.ok(command(first).commandId !== command(second).commandId);
    const acceptedVersion = 1;
    const appliedVersion = 0;
    assert.equal(appliedVersion < acceptedVersion, true, second + " must await " + first + " acknowledgment");
    assert.equal(acceptedVersion < acceptedVersion, false, "next command may proceed only after acknowledgment");
  }
});

test("Big Clock retries a lost acknowledgment without replaying an applied command", () => {
  const clock = fs.readFileSync(new URL("../../public/coaches/execution/big-clock-2.0/big-clock-2.0.js", import.meta.url), "utf8");
  const poll = clock.slice(clock.indexOf("function subscribeRemoteControl()"), clock.indexOf("function matLaneLabel()"));
  assert.match(poll, /current\.remoteCommandVersion\s*\|\|\s*0\) === version/);
  assert.match(poll, /control\.appliedVersion\s*\|\|\s*0\) < version/);
  assert.match(poll, /await setState\(current\)/);
  assert.match(poll, /return;[\s\S]*applyExecutionCommand\(current, control\.command/);
  assert.match(poll, /await setState\(next\)/);
});
