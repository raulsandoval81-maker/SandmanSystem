import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildActualsSubmission,
  executionObservation,
  summarizeObservedExecution
} from "../../public/coaches/execution/engine/practice-execution-actuals.mjs";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const plan = [{ blockId: "drills", title: "Drills", drills: [
  { id: "d1", name: "Finish", phases: [{ id: "p1" }] },
  { id: "d2", name: "Chain", phases: [{ id: "p2" }] }
] }];
const event = (action, overrides = {}) => ({
  eventId: `${action}-1`, practiceId: "practice-1", sessionId: "session-1", planVersion: 1,
  blockId: "drills", drillId: "d1", phaseId: "p1", action, elapsedSeconds: 20,
  sequence: 1, ...overrides
});

test("planned, observed, and Coach-verified evidence stay distinct", () => {
  const observed = summarizeObservedExecution(plan, [event("pause")]);
  assert.equal(observed[0].status, "partial");
  assert.equal(observed[0].observedOnly, true);
  assert.deepEqual(observed[0].athleteIds, []);
  const verified = buildActualsSubmission({ practiceId: "practice-1", planVersion: 1,
    verificationId: "verify-1", entries: [{ blockId: "drills", drillId: "d1", outcome: "completed" }] });
  assert.equal(verified.coachVerified, false);
  assert.equal(verified.xpEligible, false);
  assert.equal(verified.closeoutFinalized, false);
});

test("completed, partial, skipped, and early-completed work remain truthful", () => {
  assert.equal(summarizeObservedExecution(plan, [event("complete", { drillId: "", phaseId: "" })])[0].status, "completed");
  assert.equal(summarizeObservedExecution(plan, [event("pause")])[0].status, "partial");
  assert.equal(summarizeObservedExecution(plan, [event("skip")])[0].status, "skipped");
  const early = summarizeObservedExecution(plan, [event("early-complete")]);
  assert.equal(early[0].status, "partial");
  assert.equal(early[1].status, "not-observed");
});

test("pause/resume observations use authoritative elapsed seconds and never participants", () => {
  const pause = executionObservation({ practiceId: "practice-1", sessionId: "session-1", planVersion: 1,
    action: "pause", block: { id: "drills" }, active: { drill: { id: "d1" }, phase: { id: "p1", kind: "work", seconds: 30 }, phaseRemainingSeconds: 10 }, elapsedSeconds: 20 });
  const resume = executionObservation({ practiceId: "practice-1", sessionId: "session-1", planVersion: 1,
    action: "resume", block: { id: "drills" }, active: null, elapsedSeconds: 20 });
  assert.equal(pause.phaseElapsedSeconds, 20);
  assert.equal(resume.elapsedSeconds, 20);
  assert.deepEqual(pause.athleteIds, []);
});

test("Coach actuals support group and athlete attribution without granting authority", () => {
  const result = buildActualsSubmission({ practiceId: "practice-1", planVersion: 1, verificationId: "v1", entries: [{
    blockId: "drills", drillId: "d1", outcome: "modified", groupIds: ["g1"], athleteIds: ["a1"], note: "Shortened"
  }] });
  assert.deepEqual(result.entries[0].groupIds, ["g1"]);
  assert.deepEqual(result.entries[0].athleteIds, ["a1"]);
  assert.equal(result.attendanceAuthority, false);
  assert.equal(result.progressionEligible, false);
});

test("legacy blocks, MANUAL, and HYBRID remain reviewable while AUTO is not made executable", async () => {
  const legacy = summarizeObservedExecution([{ blockId: "warmup", title: "Warm Up", drills: [] }], [event("complete", { blockId: "warmup", drillId: "", phaseId: "" })]);
  assert.equal(legacy[0].status, "completed");
  const [clock, companion, execution] = await Promise.all([
    read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js"),
    read("public/coaches/execution/coach-companion/coach-companion.js"),
    read("public/coaches/execution/engine/practice-execution-contract.mjs")
  ]);
  assert.match(clock, /executionObservation/);
  assert.match(companion, /actuals-draft/);
  assert.match(execution, /AUTO_PREVIEW_NOT_EXECUTABLE/);
  assert.doesNotMatch(companion, /eligibleForAuto:\s*true/);
});

test("server policy enforces idempotency, stale plans, contamination, authorization, roster, and timestamps", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  assert.match(source, /requirePracticeOwner\(actor, practice\)/);
  assert.match(source, /Execution observation belongs to another practice/);
  assert.match(source, /belongs to another live session/);
  assert.match(source, /uses a stale practice plan/);
  assert.match(source, /Execution event identity is already in use/);
  assert.match(source, /idempotent = true/);
  assert.match(source, /server-owned/);
  assert.match(source, /verifiedAt: now, verifiedBy: actor\.uid/);
  assert.match(source, /authorized practice roster/);
  assert.match(source, /Coach-verified actuals are immutable/);
});

test("actuals operations have no XP, progression, testing, attendance, or Closeout side effects", async () => {
  const source = await read("functions/src/practice/practiceSessions.ts");
  const start = source.indexOf('if (operation === "actuals-draft"');
  const end = source.indexOf('if (operation === "actuals-draft")', start);
  const branch = source.slice(start, end);
  assert.match(branch, /xpEligible: false/);
  assert.match(branch, /progressionEligible: false/);
  assert.match(branch, /attendanceAuthority: false/);
  assert.match(branch, /closeoutFinalized: false/);
  assert.doesNotMatch(branch, /award|mastery|promotion|closePracticeSession|finalized:\s*true/i);
});

test("unsupported outcomes and forged observation actions fail closed", () => {
  assert.throws(() => buildActualsSubmission({ practiceId: "p", planVersion: 1, entries: [{ blockId: "b", outcome: "certified" }] }), /UNSUPPORTED_COACH_OUTCOME/);
  assert.throws(() => executionObservation({ practiceId: "p", sessionId: "s", planVersion: 1, action: "award", block: { id: "b" } }), /UNSUPPORTED_EXECUTION_ACTION/);
});
