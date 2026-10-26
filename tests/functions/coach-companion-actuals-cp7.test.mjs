import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildActualsSubmission,
  completedExecutionMilestones,
  createObservationQueue,
  executionObservation,
  resolveNextPlanVersion,
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
  assert.equal(summarizeObservedExecution(plan, [event("drill-complete")])[0].status, "completed");
  assert.equal(summarizeObservedExecution(plan, [event("complete", { drillId: "", phaseId: "" })])[0].status, "not-observed");
  assert.equal(summarizeObservedExecution(plan, [event("pause")])[0].status, "partial");
  assert.equal(summarizeObservedExecution(plan, [event("skip")])[0].status, "partial");
  assert.deepEqual(summarizeObservedExecution(plan, [event("skip")])[0].skippedPhaseIds, ["p1"]);
  assert.equal(summarizeObservedExecution(plan, [event("skip", { phaseId: "" })])[0].status, "skipped");
  const early = summarizeObservedExecution(plan, [event("early-complete")]);
  assert.equal(early[0].status, "partial");
  assert.equal(early[1].status, "not-observed");
});

test("parent-clock milestones identify only drills and phases actually crossed", () => {
  const block = { drills: [
    { id: "d1", seconds: 30, phases: [{ id: "p1", seconds: 20 }, { id: "p2", seconds: 10 }] },
    { id: "d2", seconds: 30, phases: [{ id: "p3", seconds: 30 }] }
  ] };
  assert.deepEqual(completedExecutionMilestones(block, 25).map(item => [item.action, item.active.drill.id, item.active.phase?.id]), [
    ["phase-complete", "d1", "p1"]
  ]);
  assert.deepEqual(completedExecutionMilestones(block, 30).map(item => item.action), ["phase-complete", "phase-complete", "drill-complete"]);
  assert.ok(completedExecutionMilestones(block, 60).some(item => item.action === "drill-complete" && item.active.drill.id === "d2"));
});

test("jumped-over phases and their drills never become completion milestones", () => {
  const block = { drills: [{ id: "d1", seconds: 30, phases: [
    { id: "p1", seconds: 10 }, { id: "p2", seconds: 20 }
  ] }] };
  const milestones = completedExecutionMilestones(block, 30, ["phase:d1:p1", "drill:d1"]);
  assert.deepEqual(milestones.map(item => `${item.action}:${item.active.phase?.id || ""}`), ["phase-complete:p2"]);
});

test("rapid observations persist serially, retain failed work, and retry idempotently", async () => {
  const calls = [];
  let failOnce = true;
  let latest;
  const queue = createObservationQueue({
    persist: async item => {
      calls.push(item.eventId);
      if (item.eventId === "pause" && failOnce) { failOnce = false; throw new Error("offline"); }
    },
    onChange: state => { latest = state; }
  });
  assert.equal(queue.enqueue({ eventId: "pause" }), true);
  assert.equal(queue.enqueue({ eventId: "resume" }), true);
  assert.equal(queue.enqueue({ eventId: "resume" }), false);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(latest.pending.map(item => item.eventId), ["pause", "resume"]);
  assert.match(latest.lastError.message, /offline/);
  queue.retry();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls, ["pause", "pause", "resume"]);
  assert.deepEqual(latest.pending, []);
  assert.equal(latest.lastError, null);
});

test("canonical Clipboard plan versions increment and legacy plans begin at one", async () => {
  assert.equal(resolveNextPlanVersion(undefined), 1);
  assert.equal(resolveNextPlanVersion(1), 2);
  assert.equal(resolveNextPlanVersion(9), 10);
  const clipboard = await read("public/coaches/execution/clipboard-2.0/clipboard-2.0.js");
  assert.match(clipboard, /resolveNextPlanVersion\(practice\.sessionMemory\?\.planVersion\)/);
  assert.doesNotMatch(clipboard, /planVersion:\s*1/);
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
  assert.match(source, /planVersion !== currentVersion \+ 1/);
  assert.match(source, /Practice plan version must advance exactly once/);
  assert.match(source, /Execution event identity is already in use/);
  assert.match(source, /idempotent = true/);
  assert.match(source, /server-owned/);
  assert.match(source, /verifiedAt: now, verifiedBy: actor\.uid/);
  assert.match(source, /authorized practice roster/);
  assert.match(source, /Coach-verified actuals are immutable/);
});

test("Coach Companion reloads server actuals on refresh, focus, and cross-tab evidence changes", async () => {
  const source = await read("public/coaches/execution/coach-companion/coach-companion.js");
  assert.match(source, /async function refreshCanonicalPractice/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /window\.addEventListener\("storage"/);
  assert.match(source, /window\.addEventListener\("focus"/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /ensureSelectedOption/);
  assert.match(source, /authorizedIds\.has/);
  assert.match(source, /memory\.verifiedActuals \|\| memory\.actualsDraft/);
});

test("Big Clock exposes failed observation sync and reuses the same queue on retry", async () => {
  const [source, html] = await Promise.all([
    read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js"),
    read("public/coaches/execution/big-clock-2.0/index.html")
  ]);
  assert.match(source, /createObservationQueue/);
  assert.match(source, /OBSERVATION_QUEUE_PREFIX/);
  assert.match(source, /window\.retryExecutionEvidence/);
  assert.match(html, /id="executionEvidenceStatus"/);
  assert.match(html, /id="retryExecutionEvidenceBtn"/);
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
