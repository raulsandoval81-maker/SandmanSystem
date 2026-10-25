import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  currentAndNextActivity,
  materializeLiveState,
  totalPracticeProgress,
  transitionLiveState
} from "../../public/coaches/execution/engine/live-execution-state.mjs";

const blocks = [
  { blockId:"technique", title:"Technique", minutes:2, cards:[{title:"Stance Motion"}], drillBlocks:[{name:"Entry",minutes:1},{name:"Finish",minutes:1}] },
  { blockId:"live", title:"Live", minutes:1, cards:[{title:"Situational Wrestling"}] }
];

test("start, drift, pause, reload materialization, and resume remain server-anchor based", () => {
  const started = transitionLiveState({status:"ready",revision:0,index:0,elapsedSeconds:0},"start",blocks,1_000).state;
  assert.equal(started.anchorEpochMs,1_000);
  assert.equal(materializeLiveState(started,31_900,blocks).elapsedSeconds,30);
  const paused = transitionLiveState(started,"pause",blocks,31_900).state;
  assert.equal(paused.elapsedSeconds,30);
  assert.equal(materializeLiveState(paused,91_900,blocks).elapsedSeconds,30);
  const resumed = transitionLiveState(paused,"resume",blocks,100_000).state;
  assert.equal(materializeLiveState(resumed,115_200,blocks).elapsedSeconds,45);
});

test("skip, repeat, back, and reset preserve distinct execution evidence", () => {
  const running = transitionLiveState({status:"ready",revision:0},"start",blocks,1_000).state;
  const repeated = transitionLiveState({...running,elapsedSeconds:25,anchorEpochMs:10_000},"repeat",blocks,10_000);
  assert.equal(repeated.evidence.disposition,"repeated");
  assert.equal(repeated.state.index,0);
  const skipped = transitionLiveState(repeated.state,"skip",blocks,11_000);
  assert.equal(skipped.evidence.disposition,"skipped");
  assert.equal(skipped.state.index,1);
  const backed = transitionLiveState(skipped.state,"back",blocks,12_000);
  assert.equal(backed.evidence.disposition,"left-for-previous");
  assert.equal(backed.state.index,0);
  const reset = transitionLiveState(backed.state,"reset",blocks,13_000);
  assert.equal(reset.evidence.disposition,"reset");
  assert.equal(reset.state.status,"ready");
  assert.deepEqual([running.revision,repeated.state.revision,skipped.state.revision,backed.state.revision,reset.state.revision],[1,2,3,4,5]);
});

test("natural advance records completed work and progress remains deterministic", () => {
  const ended = {status:"running",revision:1,index:0,elapsedSeconds:0,anchorEpochMs:1_000};
  const completed = transitionLiveState(ended,"advance",blocks,121_000);
  assert.equal(completed.evidence.disposition,"completed");
  assert.equal(completed.evidence.elapsedSeconds,120);
  assert.equal(completed.state.index,1);
  assert.equal(totalPracticeProgress(completed.state,blocks,121_000).ratio,2/3);
});

test("current and upcoming activities survive the coordinated three-group payload", () => {
  const groups = [
    {id:"group-a",athleteNames:["P. Silva","R. Silva"],journey:"P2L",tier:"T0"},
    {id:"group-b",athleteNames:["M. Sandoval","J. Zaragoza","C. Kwasi"],journey:"P2L",tier:"T1"},
    {id:"group-c",athleteNames:["L. Sampson"],journey:"Z2H",tier:"T0"}
  ];
  const coordinated = [{...blocks[0],groupActivities:groups.map(group=>({groupId:group.id,cards:[{id:`card-${group.id}`,title:`Instruction ${group.id}`,provenance:"approved-curriculum"}],athleteIds:group.athleteNames}))}];
  assert.equal(new Set(coordinated[0].groupActivities.flatMap(item=>item.athleteIds)).size,6);
  assert.equal(coordinated[0].groupActivities.length,3);
  const activity = currentAndNextActivity({status:"paused",index:0,elapsedSeconds:70},coordinated,0);
  assert.equal(activity.currentActivity.name,"Finish");
});

test("Big Clock and Coach Companion share one revisioned callable and canonical snapshot", async () => {
  const root = new URL("../../",import.meta.url);
  const [clock,companion,server,clipboard] = await Promise.all([
    readFile(new URL("public/coaches/execution/big-clock-2.0/big-clock-2.0.js",root),"utf8"),
    readFile(new URL("public/coaches/execution/coach-companion/coach-companion.js",root),"utf8"),
    readFile(new URL("functions/src/practice/practiceSessions.ts",root),"utf8"),
    readFile(new URL("public/coaches/execution/clipboard-2.0/clipboard-2.0.js",root),"utf8")
  ]);
  for (const client of [clock,companion]) {
    assert.match(client,/updatePracticeExecutionState/);
    assert.match(client,/expectedRevision:/);
    assert.match(client,/onSnapshot\(/);
  }
  assert.match(server,/Practice state changed on another device/);
  assert.match(server,/"sessionMemory\.executionEvidence"/);
  assert.match(server,/result\.event\?\.disposition === "completed"/);
  assert.match(server,/executionEvidence = result\.event/);
  assert.match(clipboard,/executionRevision:\s*0/);
  assert.match(clipboard,/status:\s*"ready"/);
});

test("AUTO remains fail-closed and reset requires explicit confirmation", async () => {
  const root = new URL("../../",import.meta.url);
  const [builder,server] = await Promise.all([
    readFile(new URL("public/coaches/execution/session-builder/session-builder.js",root),"utf8"),
    readFile(new URL("functions/src/practice/practiceSessions.ts",root),"utf8")
  ]);
  assert.match(builder,/!canLaunchAuto\(payload\.trainingGroups, payload\.groupPrescriptions\)/);
  assert.match(server,/command === "reset" && request\.data\?\.confirmReset !== true/);
});
