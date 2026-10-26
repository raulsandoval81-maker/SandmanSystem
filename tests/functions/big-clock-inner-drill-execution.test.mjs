import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  compilePracticeTimeline,
  getActiveInnerDrill,
  getRunElapsedSeconds,
  pauseRunClock,
  resumeRunClock,
  seekRunClock
} from "../../public/coaches/execution/engine/practice-execution-contract.mjs";
import {
  compileMatches,
  createInnerDrill,
  toClipboardDrillBlock
} from "../../public/assets/js/practice/shared-inner-drill-contract.js";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const inner = (kind, timer, overrides = {}) => createInnerDrill({
  id: overrides.id || `${kind}-one`, name: overrides.name || `${kind} one`, kind,
  parentBlock: overrides.parentBlock || "drills", discipline: "wrestling",
  practiceMode: overrides.practiceMode || "manual", origin: overrides.origin || "coach",
  assignedGroupIds: overrides.assignedGroupIds || ["group-a"],
  instructionalPurpose: "Coach-approved practice", goal: "Maintain position",
  coachingCues: ["Position"], flowCues: ["Go"], timer,
  recommendationProvenance: overrides.recommendationProvenance || null
});
const timelineFor = (drills, minutes = 10, timer = null) => compilePracticeTimeline({
  blocks: [{ slot: "drills", title: "Drills", minutes, timer, drillBlocks: drills }]
});

test("continuous inner drill executes one exact phase without fabricated breaks", () => {
  const plan = timelineFor([toClipboardDrillBlock(inner("drill", {type:"continuous",seconds:95}))], 2);
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.blocks[0].drills[0].phases.map(phase => [phase.kind, phase.seconds]), [["work",95]]);
  assert.equal(getActiveInnerDrill(plan.blocks[0], 94).phaseRemainingSeconds, 1);
  assert.equal(getActiveInnerDrill(plan.blocks[0], 95), null);
});

test("drill work and rest phases execute sequentially with identifiable rounds", () => {
  const plan = timelineFor([toClipboardDrillBlock(inner("drill",
    {type:"interval",workSeconds:30,restSeconds:10,rounds:3}))], 2);
  const block = plan.blocks[0];
  assert.deepEqual(block.drills[0].phases.map(phase => phase.kind), ["work","rest","work","rest","work"]);
  assert.deepEqual([getActiveInnerDrill(block,0).phase.round,getActiveInnerDrill(block,30).phase.kind,
    getActiveInnerDrill(block,40).phase.round],[1,"rest",2]);
  assert.equal(block.drills[0].phases.at(-1).kind,"work");
});

test("live rotation preserves ordered rotation context and recovery", () => {
  const plan = timelineFor([toClipboardDrillBlock(inner("live",
    {type:"rotation",format:"top-bottom-out",athleteCount:3,workSeconds:30,restSeconds:10},
    {parentBlock:"live"}))], 2);
  const phases = plan.blocks[0].drills[0].phases;
  assert.equal(plan.valid,true);
  assert.equal(phases.filter(phase => phase.rotation).length,3);
  assert.equal(phases.filter(phase => phase.kind === "rest").length,2);
  assert.match(phases[0].rotation.detail,/TOP 1/);
});

test("match periods include only configured breaks and expose short-time state", () => {
  const match = inner("match", {type:"match",periodSeconds:[60,30],periodBreakSeconds:15,
    matchCount:2,recoverySeconds:20,shortTimeSeconds:10}, {parentBlock:"live"});
  const plan = timelineFor([toClipboardDrillBlock(match)], 4);
  const phases = plan.blocks[0].drills[0].phases;
  assert.equal(phases.filter(phase => phase.label === "Period break").length,2);
  assert.equal(phases.filter(phase => phase.label === "Between matches").length,1);
  const first = getActiveInnerDrill(plan.blocks[0],51);
  assert.equal(first.shortTimeActive,true);
  assert.equal(first.phaseRemainingSeconds,9);
  assert.equal(compileMatches({periodSeconds:[30],matchCount:1,recoverySeconds:99}).length,1);
});

test("pause and resume preserve elapsed phase time", () => {
  const running = {running:true,paused:false,blockStartedAt:1000,blockElapsedSeconds:0};
  const paused = pauseRunClock(running,16000);
  assert.equal(paused.blockElapsedSeconds,15);
  assert.equal(getRunElapsedSeconds(paused,60000),15);
  const resumed = resumeRunClock(paused,61000);
  assert.equal(getRunElapsedSeconds(resumed,66000),20);
});

test("Coach skip seeks the same authoritative block clock to the phase boundary", () => {
  const state = {running:true,paused:false,blockStartedAt:1000};
  const skipped = seekRunClock(state,40,51000);
  assert.equal(getRunElapsedSeconds(skipped,51000),40);
  assert.equal(getRunElapsedSeconds(skipped,56000),45);
});

test("exact and whole-minute parent capacity fail closed without truncation", () => {
  const a = toClipboardDrillBlock(inner("drill",{type:"continuous",seconds:61},{id:"a"}));
  const b = toClipboardDrillBlock(inner("drill",{type:"continuous",seconds:61},{id:"b"}));
  const reserved = timelineFor([a,b],3);
  assert.equal(reserved.valid,false);
  assert.ok(reserved.errors.some(error => error.code === "INNER_DRILL_RESERVATION_OVER_ALLOCATED"));
  assert.deepEqual(reserved.events,[]);
  const exact = timelineFor([toClipboardDrillBlock(inner("drill",{type:"continuous",seconds:121}))],2);
  assert.equal(exact.valid,false);
  assert.ok(exact.errors.some(error => error.code === "OVER_ALLOCATED"));
});

test("unsupported, inconsistent, and parent-conflicting schedules fail closed", () => {
  const valid = toClipboardDrillBlock(inner("drill",{type:"continuous",seconds:60}));
  const unsupported = structuredClone(valid);
  unsupported.innerDrill.contractVersion = "sandman-inner-drill-v2";
  assert.equal(timelineFor([unsupported],1).errors[0].code,"UNSUPPORTED_INNER_DRILL_CONTRACT");
  const inconsistent = structuredClone(valid);
  inconsistent.innerDrill.scheduledSeconds = 59;
  assert.equal(timelineFor([inconsistent],1).errors[0].code,"INNER_DRILL_DURATION_MISMATCH");
  const fractional = structuredClone(valid);
  fractional.innerDrill.phases[0].seconds = 59.5;
  assert.equal(timelineFor([fractional],1).errors[0].code,"UNSUPPORTED_INNER_DRILL_PHASE");
  const unknownKind = structuredClone(valid);
  unknownKind.innerDrill.kind = "sparring-default";
  assert.equal(timelineFor([unknownKind],1).errors[0].code,"UNSUPPORTED_INNER_DRILL_FORMAT");
  const conflict = timelineFor([valid],2,{execution:{rounds:2,workSeconds:45,restSeconds:15}});
  assert.ok(conflict.errors.some(error => error.code === "CONFLICTING_TIMER_AND_DRILLS"));
});

test("legacy drills retain minute timing and no manufactured phase", () => {
  const plan = timelineFor([{id:"legacy",name:"Legacy",minutes:2,goal:"Original"}],2);
  assert.equal(plan.valid,true);
  assert.equal(plan.blocks[0].drills[0].seconds,120);
  assert.equal(plan.blocks[0].drills[0].phases.length,0);
  assert.equal(getActiveInnerDrill(plan.blocks[0],30).phase,null);
});

test("group identity, MANUAL, and HYBRID planning metadata remain isolated", () => {
  const manual = toClipboardDrillBlock(inner("drill",{type:"continuous",seconds:30},
    {id:"manual",assignedGroupIds:["group-a"],practiceMode:"manual"}));
  const hybrid = toClipboardDrillBlock(inner("drill",{type:"continuous",seconds:30},
    {id:"hybrid",assignedGroupIds:["group-b"],practiceMode:"hybrid"}));
  const plan = timelineFor([manual,hybrid],2);
  assert.equal(plan.valid,true);
  assert.deepEqual(plan.blocks[0].drills.map(item => item.assignedGroupIds),[["group-a"],["group-b"]]);
  assert.deepEqual(plan.blocks[0].drills.map(item => item.innerDrill.practiceMode),["manual","hybrid"]);
});

test("preview-only AUTO source cannot cross the execution adapter", () => {
  const preview = toClipboardDrillBlock(inner("drill",{type:"continuous",seconds:30},{
    practiceMode:"auto",origin:"server-suggestion",recommendationProvenance:{
      previewOnly:true,authoritative:false,eligibleForAuto:false
    }
  }));
  const plan = timelineFor([preview],1);
  assert.equal(plan.valid,false);
  assert.equal(plan.errors[0].code,"AUTO_PREVIEW_NOT_EXECUTABLE");
});

test("Big Clock uses one render interval and preserves canonical practice handoff", async () => {
  const source = await read("public/coaches/execution/big-clock-2.0/big-clock-2.0.js");
  assert.equal((source.match(/setInterval\(/g) || []).length,1);
  assert.match(source,/getRunElapsedSeconds\(data\)/);
  assert.match(source,/payload\.practiceId \|\| session\.practiceId/);
  assert.match(source,/getActiveInnerDrill\(compiledBlock/);
});

test("execution adapter has no XP, mastery, progression, or Closeout side effects", async () => {
  const source = await read("public/coaches/execution/engine/practice-execution-contract.mjs");
  assert.doesNotMatch(source,/from\s+["'][^"']*firebase|httpsCallable\(|awardXp\(|setDoc\(|closePractice\(/i);
});
