import test from "node:test";
import assert from "node:assert/strict";
import { compilePracticeTimeline, normalizeExecutionMode, normalizeAudioSettings } from "../../public/coaches/execution/engine/practice-execution-contract.mjs";

test("preserves legacy timer metadata without inventing rounds", () => {
  const plan = compilePracticeTimeline({ durationMinutes: 5, blocks:[{ slot:"technique", title:"New techniques", minutes:5, timer:{ pack:"Technique Timers", preset:"Partner Drill", label:"Partner Drill" }}] });
  assert.equal(plan.valid, true);
  assert.equal(plan.blocks[0].timer.execution, null);
  assert.equal(plan.events.some(x => x.type === "round-start"), false);
});
test("compiles combat rounds and warnings to one shared timeline", () => {
  const plan = compilePracticeTimeline({durationMinutes:7,blocks:[{slot:"live",title:"Live",minutes:7,timer:{execution:{rounds:3,workSeconds:120,restSeconds:30,warningSeconds:15,linkedSkillIds:["double-leg"]}}}]});
  assert.equal(plan.valid, true);
  assert.equal(plan.totalSeconds, 420);
  assert.equal(plan.events.filter(x=>x.type==="round-start").length, 3);
  assert.equal(plan.events.filter(x=>x.type==="warning").length, 3);
  assert.equal(plan.events.filter(x=>x.type==="rest-start").length, 2);
});
test("reports overflow rather than silently shortening a drill", () => {
  const plan = compilePracticeTimeline({durationMinutes:2,blocks:[{slot:"drills",minutes:2,drillBlocks:[{name:"A",minutes:2},{name:"B",minutes:1}]}]});
  assert.equal(plan.valid,false);
  assert.equal(plan.errors[0].code,"OVER_ALLOCATED");
});
test("maintains one timeline regardless of execution interface", () => {
  const plan = {durationMinutes:1,blocks:[{slot:"onmat",minutes:1,cards:[{title:"Double Leg"}]}]};
  assert.deepEqual(compilePracticeTimeline(plan),compilePracticeTimeline(plan));
  assert.equal(normalizeExecutionMode("audio-only"),"audio-only");
  assert.equal(normalizeExecutionMode("big-clock"),"big-clock");
  assert.equal(normalizeAudioSettings({mode:"voice"}).mode,"voice");
});
